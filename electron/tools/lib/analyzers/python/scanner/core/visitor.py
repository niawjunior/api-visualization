import ast
from typing import Set, List, Optional
from .models import FileData, SchemaField, RouteDef, RouterDef, IncludeDef
from ..adapters.base import BaseAdapter

class ASTVisitor(ast.NodeVisitor):
    def __init__(self, file_data: FileData, adapters: List[BaseAdapter]):
        self.data = file_data
        self.adapters = adapters
        self.current_route: Optional[RouteDef] = None
        self.include_child_calls: Set[str] = set()
        
        # Precompute constants map for adapters if needed, or pass reference
        # Adapters already hold reference to self.data.constants via constructor

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

    def visit_Assign(self, node):
        # 1. Constant tracking
        if isinstance(node.value, (ast.Constant, ast.Str)):
            val = str(node.value.value)
            for t in node.targets:
                if isinstance(t, ast.Name):
                    self.data.constants[t.id] = val
                    
        # 2. Router/App definition
        if isinstance(node.value, ast.Call):
            fname = self._get_func_name(node.value.func)
            for t in node.targets:
                if isinstance(t, ast.Name):
                    var_name = t.id
                    
                    # Try adapters
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
                     
                     route = RouteDef(path, method, router_var, node.lineno, self.data.file_path)
                     
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
                         self.data.routers[router_var] = RouterDef(router_var)
                     self.data.routers[router_var].routes.append(route)
                     
                     # Context for dependency analysis
                     self.current_route = route
                     self.generic_visit(node)
                     self.current_route = None
                     return

        self.generic_visit(node)
    
    visit_AsyncFunctionDef = visit_FunctionDef

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
        
        # Schema Registration (Framework specific, but handled by Adapter usually... well, actually these modify Router state)
        # For now, let's keep the generic logic or move to adapter? 
        # Since these methods modify the router's DEFAULT schemas, it's specific.
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

    def _analyze_dependency(self, node, fname):
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
    
    def _extract_kwarg(self, node, name, default):
        for k in node.keywords:
            if k.arg == name: return k.value
        return default
