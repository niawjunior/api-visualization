import ast
from typing import Set, List, Optional
from .models import FileData, SchemaField, RouteDef, RouterDef, IncludeDef
from ..adapters.base import BaseAdapter
import os



class ImportVisitor(ast.NodeVisitor):
    """
    Lightweight visitor that ONLY parses imports.
    Used for dependency graph generation to avoid overhead of full API analysis.
    """
    def __init__(self, file_data: FileData):
        self.data = file_data

    def visit_Import(self, node):
        for alias in node.names:
            self.data.imports[alias.asname or alias.name] = alias.name
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        module = node.module or ""
        level = node.level or 0
        prefix = "." * level
        source = f"{prefix}{module}" if module else prefix
        for alias in node.names:
            full_name = f"{source}.{alias.name}" if source else alias.name
            self.data.imports[alias.asname or alias.name] = full_name
        self.generic_visit(node)

class ASTVisitor(ImportVisitor):
    def __init__(self, file_data: FileData, adapters: List[BaseAdapter]):
        super().__init__(file_data)
        self.adapters = adapters
        self.current_route: Optional[RouteDef] = None
        self.include_child_calls: Set[str] = set()
        self._func_depth = 0  # Track function nesting to skip router creation inside functions
        self._router_factories = {}  # func_name -> (func_node, router_init_node, register_calls)

    def visit_Assign(self, node):
        # 1. Constant tracking
        if isinstance(node.value, (ast.Constant, ast.Str)):
            val = str(node.value.value)
            for t in node.targets:
                if isinstance(t, ast.Name):
                    self.data.constants[t.id] = val

        # 2. List literal storage (for loop unrolling)
        if isinstance(node.value, ast.List):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    parsed = self._parse_list_literal(node.value)
                    if parsed:
                        self.data.list_literals[t.id] = parsed

        # 3. Dict literal storage (for loop unrolling)
        if isinstance(node.value, ast.Dict):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    parsed = self._parse_dict_literal(node.value)
                    if parsed:
                        self.data.dict_literals[t.id] = parsed

        # 4. dict() constructor call storage
        if isinstance(node.value, ast.Call):
            fname = self._get_func_name(node.value.func)
            if fname == 'dict':
                for t in node.targets:
                    if isinstance(t, ast.Name):
                        parsed = self._parse_dict_call(node.value)
                        if parsed:
                            self.data.dict_literals[t.id] = parsed

        # 5. Router alias: router = existing_router_var (share the same RouterDef object)
        # Skip router creation inside function bodies (e.g., factory functions)
        if self._func_depth == 0:
            if isinstance(node.value, ast.Name) and node.value.id in self.data.routers:
                for t in node.targets:
                    if isinstance(t, ast.Name) and t.id != node.value.id:
                        self.data.routers[t.id] = self.data.routers[node.value.id]

        # 6. Router/App definition (share one RouterDef for chained assignments like a = b = CrudAPIRouter(...))
        # Skip router creation inside function bodies (e.g., factory functions)
        if self._func_depth == 0 and isinstance(node.value, ast.Call):
            fname = self._get_func_name(node.value.func)
            shared_rdef = None
            for t in node.targets:
                if isinstance(t, ast.Name):
                    var_name = t.id

                    # Try adapters
                    parsed = False
                    for adapter in self.adapters:
                        res = adapter.parse_router_init(node.value)
                        if res:
                            p, parent, model = res
                            if shared_rdef is None:
                                shared_rdef = RouterDef(var_name, p, model, parent)
                            self.data.routers[var_name] = shared_rdef
                            parsed = True
                            break

                    if not parsed and fname.endswith("FastAPI"):
                         self.data.app_var = var_name
                         if shared_rdef is None:
                             shared_rdef = RouterDef(var_name)
                         self.data.routers[var_name] = shared_rdef

        self.generic_visit(node)

    def visit_AnnAssign(self, node):
        """Handle annotated assignments: var: Type = value"""
        if node.value and isinstance(node.target, ast.Name):
            var_name = node.target.id

            # List literal storage
            if isinstance(node.value, ast.List):
                parsed = self._parse_list_literal(node.value)
                if parsed:
                    self.data.list_literals[var_name] = parsed

            # Dict literal storage
            if isinstance(node.value, ast.Dict):
                parsed = self._parse_dict_literal(node.value)
                if parsed:
                    self.data.dict_literals[var_name] = parsed

            # dict() constructor
            if isinstance(node.value, ast.Call):
                fname = self._get_func_name(node.value.func)
                if fname == 'dict':
                    parsed = self._parse_dict_call(node.value)
                    if parsed:
                        self.data.dict_literals[var_name] = parsed

            # Constant tracking
            if isinstance(node.value, (ast.Constant, ast.Str)):
                self.data.constants[var_name] = str(node.value.value)

            # Router/App definition (skip inside function bodies)
            if self._func_depth == 0 and isinstance(node.value, ast.Call):
                fname = self._get_func_name(node.value.func)
                parsed = False
                for adapter in self.adapters:
                    res = adapter.parse_router_init(node.value)
                    if res:
                        p, parent, model = res
                        self.data.routers[var_name] = RouterDef(var_name, p, model, parent)
                        parsed = True
                        break
                if not parsed and fname.endswith("FastAPI"):
                    self.data.app_var = var_name
                    self.data.routers[var_name] = RouterDef(var_name)

        self.generic_visit(node)

    def visit_ClassDef(self, node):
        # Basic model detection
        bases = [self._expression_to_str(b) for b in node.bases]
        is_model = any(
            any(k in b for k in ["BaseModel", "SQLModel", "Schema", "Model", "pydantic"])
            for b in bases
        )
        if any(kw.arg == "table" for kw in node.keywords): is_model = True

        if is_model:
            fields = []
            for item in node.body:
                if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                    type_str = self._expression_to_str(item.annotation)
                    required = item.value is None
                    fields.append(SchemaField(item.target.id, type_str, required))
            self.data.models[node.name] = {"fields": fields, "bases": bases}

        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        # Route detection
        for decorator in node.decorator_list:
              if not isinstance(decorator, ast.Call): continue

              for adapter in self.adapters:
                  route_info = adapter.parse_decorator(decorator, node)
                  if route_info:
                      method, path, resp_arg = route_info
                      router_var = "app"
                      fname = self._get_func_name(decorator.func)
                      if '.' in fname: router_var = fname.split('.')[0]

                      route = RouteDef(path, method, router_var, node.lineno, self.data.file_path, function_name=node.name)

                      # Request Body (Generic)
                      SPECIAL_TYPES = {'Request', 'Response', 'BackgroundTasks', 'Session', 'AsyncSession', 'HTTPConnection', 'WebSocket', 'HTTPException'}
                      for arg in node.args.args:
                        if arg.arg == 'self': continue
                        if not arg.annotation: continue
                        type_name = self._get_base_type_name(arg.annotation)
                        if type_name and type_name not in SPECIAL_TYPES:
                            route.request_model_name = type_name
                            break

                      # Response Model
                      if resp_arg:
                          resp_node = self._extract_kwarg(decorator, resp_arg, None)
                          if resp_node:
                              route.response_model_name = self._get_base_type_name(resp_node)

                      if not route.response_model_name and node.returns:
                          route.response_model_name = self._get_base_type_name(node.returns)

                      if router_var not in self.data.routers:
                          # Don't create new routers for function-scoped variables
                          if self._func_depth > 0:
                              continue
                          self.data.routers[router_var] = RouterDef(router_var)
                      self.data.routers[router_var].routes.append(route)

                      # Context for dependency analysis
                      self.current_route = route

                      # Analyze Function Parameters for Dependency Injection
                      self._process_function_deps(node)

                      self._func_depth += 1
                      self.generic_visit(node)
                      self._func_depth -= 1
                      self.current_route = None
                      return

        # Non-route function: check if it's a router factory, then track depth
        if self._func_depth == 0:
            self._detect_router_factory(node)
        self._func_depth += 1
        self.generic_visit(node)
        self._func_depth -= 1

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_For(self, node):
        """Handle for-loop patterns: router creation, route decorators, and router inclusion."""
        # Case 1: Loop creates CrudAPIRouter instances from a list
        if self._try_handle_router_creation_loop(node):
            return

        # Case 2: Loop includes routers from dict.values()
        if self._try_handle_include_loop(node):
            return

        # Case 3: Loop creates route decorators (e.g., enum endpoints)
        if self._try_handle_route_decorator_loop(node):
            return

        # Case 4: Loop calls a factory function that creates routers
        if self._try_handle_factory_loop(node):
            return

        self.generic_visit(node)

    def visit_Call(self, node):
        fname = self._get_func_name(node.func)

        if self.current_route:
            self._analyze_dependency(node, fname)

        # Include Router
        if "include_router" in fname:
             if '.' in fname:
                 caller = fname.split('.')[0]
                 if caller in self.data.routers:
                     included = self._get_func_name(node.args[0]) if node.args else None
                     prefix_node = self._extract_kwarg(node, "prefix", "")
                     # Use first adapter for string extraction (generic enough)
                     prefix = self.adapters[0]._extract_str(prefix_node) if prefix_node else ""
                     if included:
                         self.data.routers[caller].includes.append(IncludeDef(included, prefix))

        # Child Router
        for adapter in self.adapters:
            if adapter.is_include_child_router(node):
                 if '.' in fname:
                    caller = fname.split('.')[0]
                    self.include_child_calls.add(caller)
                    if caller in self.data.routers:
                        self.data.routers[caller].includes_children = True

        # Schema Registration
        if '.' in fname:
            rvar, meth = fname.split('.')[0], fname.split('.')[-1]
            if rvar in self.data.routers:
                rdef = self.data.routers[rvar]
                if node.args:
                     schema_name = self._get_base_type_name(node.args[0])
                     if meth == 'register_list_schema': rdef.list_schema = schema_name
                     elif meth == 'register_retrieve_schema': rdef.retrieve_schema = schema_name
                     elif meth == 'register_create_schema': rdef.create_schema = schema_name
                     elif meth == 'register_update_schema': rdef.update_schema = schema_name
                     elif meth == 'register_delete_schema': rdef.delete_schema = schema_name

        self.generic_visit(node)

    # =========================================================================
    # For-loop handling: router creation loops
    # =========================================================================

    def _try_handle_router_creation_loop(self, for_node):
        """Handle: for item in list: router = CrudAPIRouter(...); router.register_*_schema(...)"""
        # Check if body has CrudAPIRouter creation
        router_var = None
        router_init = None
        for stmt in for_node.body:
            if isinstance(stmt, ast.Assign) and isinstance(stmt.value, ast.Call):
                for t in stmt.targets:
                    if isinstance(t, ast.Name):
                        for adapter in self.adapters:
                            if adapter.parse_router_init(stmt.value):
                                router_var = t.id
                                router_init = stmt.value
                                break
                        if router_var:
                            break
                if router_var:
                    break

        if not router_var:
            return False

        # Resolve iterable to list literal
        iter_name = for_node.iter.id if isinstance(for_node.iter, ast.Name) else None
        if not iter_name or iter_name not in self.data.list_literals:
            # Can't unroll - visit normally (captures one router only)
            self.generic_visit(for_node)
            return True

        elements = self.data.list_literals[iter_name]
        loop_vars = self._extract_loop_vars(for_node)
        register_calls, dict_assigns, if_register_calls = self._collect_loop_body_info(for_node.body, router_var)

        # Get adapter info from router init
        parent_var = None
        model_name = None
        for adapter in self.adapters:
            res = adapter.parse_router_init(router_init)
            if res:
                _, parent_var, model_name = res
                break

        # Process each element
        for i, elem in enumerate(elements):
            var_map = {}
            if loop_vars and isinstance(elem, (list, tuple)):
                for j, var in enumerate(loop_vars):
                    if j < len(elem) and elem[j] is not None:
                        var_map[var] = elem[j]

            # Compute prefix by evaluating the f-string with variable substitution
            prefix_node = None
            for adapter in self.adapters:
                prefix_node = adapter._extract_kwarg(router_init, "prefix", None)
                if prefix_node:
                    break

            prefix = self._eval_with_vars(prefix_node, var_map) if prefix_node else ""

            # Create unique RouterDef
            unique_var = f"{router_var}__loop_{i}"
            rdef = RouterDef(unique_var, prefix, model_name, parent_var)
            self.data.routers[unique_var] = rdef

            # Apply unconditional register calls
            for meth, schema_name in register_calls.items():
                self._apply_schema_registration(rdef, meth, schema_name)

            # Apply conditional register calls (include all for static analysis)
            for meth, schema_name in if_register_calls.items():
                self._apply_schema_registration(rdef, meth, schema_name)

            # Track dict assignments
            for dict_var in dict_assigns:
                if dict_var not in self.data.dict_router_keys:
                    self.data.dict_router_keys[dict_var] = []
                self.data.dict_router_keys[dict_var].append(unique_var)

        # Also visit remaining statements outside the loop pattern (e.g., code after the loop)
        # Don't call generic_visit on the for node itself (we handled it)
        return True

    def _try_handle_include_loop(self, for_node):
        """Handle: for router in dict.values(): parent.include_router(router)"""
        iter_func = self._get_func_name(for_node.iter)
        if not iter_func.endswith('.values'):
            return False

        dict_var = iter_func.rsplit('.', 1)[0]
        loop_var = for_node.target.id if isinstance(for_node.target, ast.Name) else None
        if not loop_var:
            return False

        # Check body for include_router and include_child_router calls
        caller_var = None
        has_include_children = False

        for stmt in for_node.body:
            if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
                fname = self._get_func_name(stmt.value.func)
                if 'include_router' in fname and '.' in fname:
                    if stmt.value.args and self._get_func_name(stmt.value.args[0]) == loop_var:
                        caller_var = fname.split('.')[0]
                if 'include_child_router' in fname:
                    has_include_children = True

        if not caller_var:
            return False

        # Store for post-scan resolution
        self.data.dict_includes.append((caller_var, dict_var, has_include_children))
        return True

    def _try_handle_route_decorator_loop(self, for_node):
        """Handle: for k, v in dict.items(): @router.get(f"/{k}") ..."""
        # Check if body (or nested loop body) has decorated function definitions
        has_route_func = self._has_route_decorator_in_stmts(for_node.body)
        if not has_route_func:
            return False

        # Try to resolve iterable
        iter_func = self._get_func_name(for_node.iter)

        # Handle dict.items() pattern
        if iter_func.endswith('.items'):
            dict_var = iter_func.rsplit('.', 1)[0]
            dict_data = self.data.dict_literals.get(dict_var)
            if not dict_data:
                self.generic_visit(for_node)
                return True

            loop_vars = []
            if isinstance(for_node.target, ast.Tuple):
                loop_vars = [e.id for e in for_node.target.elts if isinstance(e, ast.Name)]

            for key, val in dict_data.items():
                if isinstance(val, dict):
                    # Nested loop - look for inner for loop in body
                    for stmt in for_node.body:
                        if isinstance(stmt, ast.For):
                            inner_iter = self._get_func_name(stmt.iter)
                            if inner_iter.endswith('.items') or inner_iter.endswith('.values'):
                                inner_vars = []
                                if isinstance(stmt.target, ast.Tuple):
                                    inner_vars = [e.id for e in stmt.target.elts if isinstance(e, ast.Name)]

                                for inner_key in val.keys():
                                    var_map = {}
                                    if loop_vars: var_map[loop_vars[0]] = key
                                    if inner_vars: var_map[inner_vars[0]] = inner_key
                                    self._visit_stmts_with_vars(stmt.body, var_map)
                else:
                    var_map = {}
                    if loop_vars: var_map[loop_vars[0]] = key
                    self._visit_stmts_with_vars(for_node.body, var_map)

            return True

        # Fallback: visit normally (captures one route)
        self.generic_visit(for_node)
        return True

    def _detect_router_factory(self, func_node):
        """Detect if a function is a router factory (creates and returns a CrudAPIRouter)."""
        router_init = None
        router_var = None
        register_calls = {}

        for node in ast.walk(func_node):
            # Find CrudAPIRouter() creation
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
                for t in node.targets:
                    if isinstance(t, ast.Name):
                        for adapter in self.adapters:
                            if adapter.parse_router_init(node.value):
                                router_var = t.id
                                router_init = node.value
                                break
                        if router_var:
                            break

            # Find register_*_schema calls
            if router_var and isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
                fname = self._get_func_name(node.value.func)
                if '.' in fname and fname.split('.')[0] == router_var:
                    meth = fname.split('.')[-1]
                    if meth.startswith('register_') and 'schema' in meth:
                        register_calls[meth] = True

            # Find register_*_schema used as decorator
            if router_var and isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                for dec in node.decorator_list:
                    if isinstance(dec, ast.Call):
                        fname = self._get_func_name(dec.func)
                        if '.' in fname and fname.split('.')[0] == router_var:
                            meth = fname.split('.')[-1]
                            if meth.startswith('register_') and 'schema' in meth:
                                register_calls[meth] = True

        if router_var and router_init:
            self._router_factories[func_node.name] = (func_node, router_init, register_calls)

    def _try_handle_factory_loop(self, for_node):
        """Handle: for item in iterable: router = factory_func(...); dict[key] = router"""
        # Check if body has a call to a known router factory
        factory_call = None
        result_var = None
        dict_assigns = []

        for stmt in for_node.body:
            if isinstance(stmt, ast.Assign) and isinstance(stmt.value, ast.Call):
                fname = self._get_func_name(stmt.value.func)
                if fname in self._router_factories:
                    factory_call = stmt.value
                    for t in stmt.targets:
                        if isinstance(t, ast.Name):
                            result_var = t.id
                            break
                    break

        if not factory_call or not result_var:
            return False

        func_node, router_init, register_calls = self._router_factories[self._get_func_name(factory_call.func)]

        # Get adapter info from router init
        parent_var = None
        model_name = None
        for adapter in self.adapters:
            res = adapter.parse_router_init(router_init)
            if res:
                _, parent_var, model_name = res
                break

        # Collect dict assignments in loop body
        for stmt in for_node.body:
            if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1:
                target = stmt.targets[0]
                if isinstance(target, ast.Subscript):
                    dict_name = self._get_func_name(target.value)
                    if isinstance(stmt.value, ast.Name) and stmt.value.id == result_var:
                        dict_assigns.append(dict_name)

        # Try to resolve keyword args to determine prefix for each call
        # Look for 'category' and 'name' kwargs which are used in prefix=f"/{category.lower()}/{name.lower()}"
        prefix_kwarg = None
        for adapter in self.adapters:
            prefix_kwarg = adapter._extract_kwarg(router_init, "prefix", None)
            if prefix_kwarg:
                break

        # Try to resolve the iterable
        # For patterns like: for cfg in DICT.values()
        iter_func = self._get_func_name(for_node.iter)
        items = None

        if iter_func.endswith('.values'):
            dict_name = iter_func.rsplit('.', 1)[0]
            if dict_name in self.data.dict_literals:
                items = list(self.data.dict_literals[dict_name].values())
        elif isinstance(for_node.iter, ast.Name) and for_node.iter.id in self.data.list_literals:
            items = self.data.list_literals[for_node.iter.id]

        if not items:
            # Can't resolve iterable - create a single router from the factory info
            # This captures the factory pattern even without unrolling
            unique_var = f"{result_var}__factory_0"
            rdef = RouterDef(unique_var, "", model_name, parent_var)
            self.data.routers[unique_var] = rdef
            for meth in register_calls:
                self._apply_schema_registration(rdef, meth, "__factory__")
            return True

        # Resolve each element
        loop_var = for_node.target.id if isinstance(for_node.target, ast.Name) else None
        for i, elem in enumerate(items):
            # Build var_map from factory call kwargs
            var_map = {}
            for kw in factory_call.keywords:
                if kw.arg and isinstance(kw.value, ast.Attribute):
                    # Handle cfg.category, cfg.name pattern
                    if isinstance(kw.value.value, ast.Name) and kw.value.value.id == loop_var:
                        attr = kw.value.attr
                        if isinstance(elem, dict) and attr in elem:
                            var_map[kw.arg] = str(elem[attr])

            # Evaluate prefix
            prefix = ""
            if prefix_kwarg and var_map:
                prefix = self._eval_with_vars(prefix_kwarg, var_map)

            # Create unique RouterDef
            unique_var = f"{result_var}__factory_{i}"
            rdef = RouterDef(unique_var, prefix, model_name, parent_var)
            self.data.routers[unique_var] = rdef

            # Apply register calls
            for meth in register_calls:
                self._apply_schema_registration(rdef, meth, "__factory__")

            # Track dict assignments
            for dict_var in dict_assigns:
                if dict_var not in self.data.dict_router_keys:
                    self.data.dict_router_keys[dict_var] = []
                self.data.dict_router_keys[dict_var].append(unique_var)

        return True

    # =========================================================================
    # Loop helper methods
    # =========================================================================

    def _has_route_decorator_in_stmts(self, stmts):
        """Check if any statement in the list contains a route-decorated function."""
        for stmt in stmts:
            if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
                for dec in stmt.decorator_list:
                    if isinstance(dec, ast.Call):
                        for adapter in self.adapters:
                            if adapter.parse_decorator(dec, stmt):
                                return True
            if isinstance(stmt, ast.For):
                if self._has_route_decorator_in_stmts(stmt.body):
                    return True
        return False

    def _extract_loop_vars(self, for_node):
        """Extract variable names from for loop target or tuple unpacking in body."""
        # Direct tuple target: for a, b, c in list:
        if isinstance(for_node.target, ast.Tuple):
            return [e.id for e in for_node.target.elts if isinstance(e, ast.Name)]

        # Indirect unpacking: for item in list: a, b, c = item
        loop_var = for_node.target.id if isinstance(for_node.target, ast.Name) else None
        if loop_var:
            for stmt in for_node.body:
                if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1:
                    target = stmt.targets[0]
                    if isinstance(target, ast.Tuple):
                        if isinstance(stmt.value, ast.Name) and stmt.value.id == loop_var:
                            return [e.id for e in target.elts if isinstance(e, ast.Name)]
        return []

    def _collect_loop_body_info(self, body, router_var):
        """Collect register calls, dict assignments, and conditional registers from loop body."""
        register_calls = {}
        dict_assigns = []
        if_register_calls = {}

        for stmt in body:
            # Direct register_*_schema calls
            if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
                fname = self._get_func_name(stmt.value.func)
                if '.' in fname and fname.split('.')[0] == router_var:
                    meth = fname.split('.')[-1]
                    if meth.startswith('register_') and 'schema' in meth:
                        schema_name = self._get_base_type_name(stmt.value.args[0]) if stmt.value.args else None
                        register_calls[meth] = schema_name

            # Dict assignment: dict[key] = router_var
            if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1:
                target = stmt.targets[0]
                if isinstance(target, ast.Subscript):
                    dict_name = self._get_func_name(target.value)
                    if isinstance(stmt.value, ast.Name) and stmt.value.id == router_var:
                        dict_assigns.append(dict_name)

            # If blocks with register calls
            if isinstance(stmt, ast.If):
                self._collect_conditional_registers(stmt, router_var, if_register_calls)

        return register_calls, dict_assigns, if_register_calls

    def _collect_conditional_registers(self, if_node, router_var, result):
        """Recursively collect register calls from if/else blocks."""
        for block in [if_node.body, if_node.orelse]:
            for stmt in block:
                if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
                    fname = self._get_func_name(stmt.value.func)
                    if '.' in fname and fname.split('.')[0] == router_var:
                        meth = fname.split('.')[-1]
                        if meth.startswith('register_') and 'schema' in meth:
                            schema_name = self._get_base_type_name(stmt.value.args[0]) if stmt.value.args else None
                            result[meth] = schema_name
                if isinstance(stmt, ast.If):
                    self._collect_conditional_registers(stmt, router_var, result)

    def _visit_stmts_with_vars(self, stmts, var_map):
        """Visit function definitions in statements with variable substitution for decorators."""
        # Temporarily add var_map to constants
        saved = {}
        for k, v in var_map.items():
            if k in self.data.constants:
                saved[k] = self.data.constants[k]
            self.data.constants[k] = v

        for stmt in stmts:
            if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
                self.visit_FunctionDef(stmt)

        # Restore constants
        for k in var_map:
            if k in saved:
                self.data.constants[k] = saved[k]
            elif k in self.data.constants:
                del self.data.constants[k]

    def _apply_schema_registration(self, rdef, meth, schema_name):
        """Apply a schema registration method to a RouterDef."""
        if meth == 'register_list_schema': rdef.list_schema = schema_name
        elif meth == 'register_retrieve_schema': rdef.retrieve_schema = schema_name
        elif meth == 'register_create_schema': rdef.create_schema = schema_name
        elif meth == 'register_update_schema': rdef.update_schema = schema_name
        elif meth == 'register_delete_schema': rdef.delete_schema = schema_name

    # =========================================================================
    # Literal parsing
    # =========================================================================

    def _parse_list_literal(self, node):
        """Parse ast.List of ast.Tuple to extract string elements."""
        result = []
        for elt in node.elts:
            if isinstance(elt, ast.Tuple):
                values = []
                for e in elt.elts:
                    if isinstance(e, ast.Constant):
                        values.append(str(e.value))
                    else:
                        values.append(None)
                result.append(tuple(values))
        return result if result else None

    def _parse_dict_literal(self, node):
        """Parse ast.Dict to extract string keys and nested dict structures."""
        if not isinstance(node, ast.Dict):
            return None
        result = {}
        for key, val in zip(node.keys, node.values):
            # Extract key name: string constant, or attribute name (e.g., Enum.VALUE)
            key_name = None
            if isinstance(key, ast.Constant) and isinstance(key.value, str):
                key_name = key.value
            elif isinstance(key, ast.Attribute):
                key_name = key.attr
            elif isinstance(key, ast.Name):
                key_name = key.id

            if key_name:
                inner = self._parse_dict_literal(val) if isinstance(val, ast.Dict) else None
                if inner is None and isinstance(val, ast.Call):
                    inner = self._parse_dict_call(val)
                    if inner is None:
                        # Try parsing constructor calls (e.g., dataclass instances) by keyword args
                        inner = self._parse_constructor_kwargs(val)
                result[key_name] = inner if inner else True
        return result if result else None

    def _parse_constructor_kwargs(self, node):
        """Parse a constructor/function call to extract string keyword arguments."""
        if not isinstance(node, ast.Call) or not node.keywords:
            return None
        result = {}
        for kw in node.keywords:
            if kw.arg:
                if isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str):
                    result[kw.arg] = kw.value.value
        return result if result else None

    def _parse_dict_call(self, node):
        """Parse dict() constructor call to extract string keys."""
        if not isinstance(node, ast.Call):
            return None
        fname = self._get_func_name(node.func)
        if fname != 'dict':
            return None
        result = {}
        for kw in node.keywords:
            if kw.arg:
                inner = self._parse_dict_call(kw.value)
                if inner is None and isinstance(kw.value, ast.Dict):
                    inner = self._parse_dict_literal(kw.value)
                result[kw.arg] = inner if inner else True
        return result if result else None

    # =========================================================================
    # F-string evaluation with variable substitution
    # =========================================================================

    def _eval_with_vars(self, node, var_map):
        """Evaluate a string expression with variable substitution."""
        if isinstance(node, ast.JoinedStr):
            result = ""
            for v in node.values:
                if isinstance(v, ast.Constant):
                    result += str(v.value)
                elif isinstance(v, ast.FormattedValue):
                    val = self._eval_expr_with_vars(v.value, var_map)
                    result += str(val)
            return result
        elif isinstance(node, ast.Constant):
            return str(node.value)
        elif isinstance(node, ast.Name):
            return var_map.get(node.id, self.data.constants.get(node.id, ""))
        # Fallback to adapter string extraction
        return self.adapters[0]._extract_str(node) if self.adapters else ""

    def _eval_expr_with_vars(self, node, var_map):
        """Evaluate an expression node with variable substitution, supporting .lower()/.upper()."""
        if isinstance(node, ast.Name):
            return var_map.get(node.id, self.data.constants.get(node.id, ""))
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                obj_val = self._eval_expr_with_vars(node.func.value, var_map)
                method = node.func.attr
                if method == 'lower': return str(obj_val).lower()
                if method == 'upper': return str(obj_val).upper()
                if method == 'strip': return str(obj_val).strip()
                return str(obj_val)
        if isinstance(node, ast.Constant):
            return str(node.value)
        return ""

    # =========================================================================
    # Dependency analysis (unchanged)
    # =========================================================================

    def _analyze_dependency(self, node, fname):
        # 1. Explicit Depends(...) support
        is_depends = fname == "Depends" or fname.endswith(".Depends")
        if is_depends and node.args:
            # Extract the inner dependency
            inner = node.args[0]
            dep_name = ""
            if isinstance(inner, ast.Call):
                dep_name = self._get_func_name(inner.func)
            elif isinstance(inner, (ast.Name, ast.Attribute)):
                dep_name = self._expression_to_str(inner)

            if dep_name:
                # Classify based on name, default to "services"
                cat = "services"
                if any(x in dep_name.lower() for x in ["db", "session", "repo", "database"]):
                    cat = "database"

                # Use module name as label if possible
                mod = dep_name.split('.')[0] if '.' in dep_name else "Dependencies"

                self._add_dep(cat, mod, dep_name)
                return

        is_db = ("session" in fname or "db" in fname or "repo" in fname) and \
                any(x in fname for x in ["exec", "add", "commit", "query", "get", "flush", "refresh"])
        if fname in ["select", "update", "delete", "insert"]: is_db = True

        if is_db:
             self._add_dep("database", "Database", fname)
             for arg in node.args:
                 v = self._get_base_type_name(arg)
                 if v and v[0].isupper() and ("Model" in v or "Schema" in v):
                      if v not in self.current_route.dependencies["tables"]:
                           self.current_route.dependencies["tables"].append(v)

        if any(fname.startswith(x) for x in ["requests.", "httpx."]):
            self._add_dep("external", "External API", fname)
            if node.args:
                 url = self.adapters[0]._extract_str(node.args[0])
                 if url and url not in self.current_route.dependencies["apiCalls"]:
                      self.current_route.dependencies["apiCalls"].append(url)

        if '.' in fname:
            mod = fname.split('.')[0]
            if mod.endswith("_service") or mod.endswith("Service"):
                self._add_dep("services", mod, fname)

    def _add_dep(self, cat, mod, item):
        for d in self.current_route.dependencies[cat]:
            if d["module"] == mod:
                if item not in d["items"]: d["items"].append(item)
                return
        self.current_route.dependencies[cat].append({
            "module": mod, "moduleLabel": mod, "type": cat, "items": [item], "count": 1
        })

    # =========================================================================
    # AST utility methods (unchanged)
    # =========================================================================

    def _get_func_name(self, node):
        if isinstance(node, ast.Name): return node.id
        if isinstance(node, ast.Attribute): return f"{self._get_func_name(node.value)}.{node.attr}"
        if isinstance(node, ast.Call): return self._get_func_name(node.func)
        return ""

    def _expression_to_str(self, node):
        if isinstance(node, ast.Name): return node.id
        if isinstance(node, ast.Attribute): return f"{self._expression_to_str(node.value)}.{node.attr}"
        if isinstance(node, ast.Subscript):
            v = self._expression_to_str(node.value)
            sl = node.slice
            if hasattr(ast, 'Index') and isinstance(sl, ast.Index): sl = sl.value
            inner = ""
            if isinstance(sl, ast.Tuple):
                 inner = ", ".join(self._expression_to_str(e) for e in sl.elts)
            else:
                 inner = self._expression_to_str(sl)
            return f"{v}[{inner}]"
        return self._get_func_name(node)

    def _get_base_type_name(self, node):
        if isinstance(node, ast.Name): return node.id
        if isinstance(node, ast.Attribute): return f"{self._get_base_type_name(node.value)}.{node.attr}"
        if isinstance(node, ast.Call): return self._get_base_type_name(node.func)
        if isinstance(node, ast.Subscript):
             val = self._get_base_type_name(node.value)
             if val in ['Annotated', 'List', 'Optional', 'Union', 'ApiResponse', 'Type', 'Generic']:
                  sl = node.slice
                  if hasattr(ast, 'Index') and isinstance(sl, ast.Index): sl = sl.value
                  first = sl.elts[0] if isinstance(sl, ast.Tuple) and sl.elts else sl
                  return self._get_base_type_name(first)
             return val
        return ""

    def _process_function_deps(self, func_node):
        """
        Scans function arguments for Depends() usage, either as default values or within Annotated.
        """
        for arg in func_node.args.args:
            if arg.annotation:
                 self._check_annotated_dependency(arg.annotation)

        if func_node.args.defaults:
            for d in func_node.args.defaults:
                self._check_depends_call(d)

    def _check_annotated_dependency(self, node):
        if not isinstance(node, ast.Subscript): return

        base = self._get_base_type_name(node.value)

        if base in ['Optional', 'List', 'Union', 'Iterable', 'Sequence']:
            sl = node.slice
            if hasattr(ast, 'Index') and isinstance(sl, ast.Index): sl = sl.value

            if isinstance(sl, ast.Tuple):
                for elt in sl.elts:
                    self._check_annotated_dependency(elt)
            else:
                 self._check_annotated_dependency(sl)
            return

        if base == 'Annotated' or base.endswith('.Annotated'):
            sl = node.slice

            items = []
            if hasattr(ast, 'Index') and isinstance(sl, ast.Index): sl = sl.value

            if isinstance(sl, ast.Tuple):
                items = sl.elts
            else:
                items = [sl]

            for item in items[1:]:
                self._check_depends_call(item)

    def _check_depends_call(self, node):
        if not isinstance(node, ast.Call): return

        fname = self._get_func_name(node.func)
        if fname == "Depends" or fname.endswith(".Depends"):
             if node.args:
                 self._analyze_dependency(node, fname)

    def _extract_kwarg(self, node, name, default):
        for k in node.keywords:
            if k.arg == name: return k.value
        return default
