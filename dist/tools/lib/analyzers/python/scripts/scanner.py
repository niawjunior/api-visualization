import ast
import json
import os
import sys
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Set, Any, Tuple
import logging
import re

# Setup logging
logging.basicConfig(
    filename='scanner_debug.log',
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# --- Data Structures ---

class SchemaField:
    def __init__(self, name: str, type_name: str, required: bool):
        self.name = name; self.type_name = type_name; self.required = required
    def to_dict(self): return {"name": self.name, "type": self.type_name, "required": self.required}

class RouteDef:
    def __init__(self, path: str, method: str, router_var: str, lineno: int, file_path: str):
        self.path = path; self.method = method; self.router_var = router_var
        self.lineno = lineno; self.file_path = file_path; self.full_path = ""
        self.dependencies = {"services": [], "database": [], "external": [], "utilities": [], "tables": [], "apiCalls": []}
        self.request_schema: List[SchemaField] = []; self.response_schema: List[SchemaField] = []
        self.request_model_name: Optional[str] = None; self.response_model_name: Optional[str] = None

    def to_dict(self):
        return {
            "path": self.path, "method": self.method, "router_var": self.router_var,
            "lineno": self.lineno, "file_path": self.file_path, "full_path": self.full_path or self.path,
            "dependencies": self.dependencies,
            "request_schema": [f.to_dict() for f in self.request_schema],
            "response_schema": [f.to_dict() for f in self.response_schema]
        }

class IncludeDef:
    def __init__(self, router_var: str, prefix: str = ""): self.router_var = router_var; self.prefix = prefix

class RouterDef:
    def __init__(self, var_name: str, prefix: str = "", model_name: str = None, parent_var: str = None):
        self.var_name = var_name; self.prefix = prefix; self.model_name = model_name
        self.parent_var = parent_var; self.includes_children = False
        self.includes: List[IncludeDef] = []; self.routes: List[RouteDef] = []
        self.list_schema = self.retrieve_schema = self.create_schema = self.update_schema = self.delete_schema = None

class FileData:
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.imports: Dict[str, str] = {} # alias -> full_import_path
        self.routers: Dict[str, RouterDef] = {}
        self.app_var: Optional[str] = None
        self.models: Dict[str, Dict[str, Any]] = {}
        self.constants: Dict[str, str] = {} # name -> literal_value

# --- Helper Classes ---

class ImportResolver:
    def __init__(self, project_root: Path, file_map: Dict[str, FileData]):
        self.root = project_root
        self.files = file_map

    def resolve_module(self, module_str: str, current_file: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Resolves a module string to (file_path, member_name).
        Example: "app.models.user" -> ("app/models/user.py", None)
                 "app.models.user.User" -> ("app/models/user.py", "User")
        """
        parts = module_str.split('.')
        # Try to match largest prefix to a file
        for i in range(len(parts), 0, -1):
            path_parts = parts[:i]
            member_parts = parts[i:]
            
            # Construct potential file paths
            # 1. As regular file
            rel_path = "/".join(path_parts) + ".py"
            # 2. As package init
            init_path = "/".join(path_parts) + "/__init__.py"

            if rel_path in self.files:
                return rel_path, (member_parts[0] if member_parts else None)
            if init_path in self.files:
                return init_path, (member_parts[0] if member_parts else None)
        
        return None, None

class TypeResolver:
    def __init__(self, import_resolver: ImportResolver, file_map: Dict[str, FileData]):
        self.resolver = import_resolver
        self.files = file_map

    def find_model_fields(self, file_data: FileData, model_name: str, visited: Set[Tuple[str, str]] = None) -> List[SchemaField]:
        if visited is None: visited = set()
        model_id = (file_data.file_path, model_name)
        if model_id in visited: return []
        visited.add(model_id)

        # 1. Check local definition
        if model_name in file_data.models:
            model_def = file_data.models[model_name]
            fields = {f.name: f for f in model_def['fields']}
            
            # Inherited fields
            for base in model_def.get('bases', []):
                # We care about Pydantic/SQLModel bases
                if any(x in base for x in ["BaseModel", "SQLModel", "Schema", "Model"]):
                    base_fields = self.find_model_fields(file_data, base, visited.copy())
                    for bf in base_fields:
                        if bf.name not in fields: fields[bf.name] = bf
            return list(fields.values())

        # 2. Check imports
        if model_name in file_data.imports:
            imp_str = file_data.imports[model_name]
            target_file, target_member = self.resolver.resolve_module(imp_str, file_data.file_path)
            # If target_member is None, it might mean the import was "from params import User" so import string is "params.User" which resolves to "params.py", "User"
            # Our visit_ImportFrom logic stores full path "module.Member"
            
            if target_file and target_file in self.files:
                target_name = target_member or model_name # Default fallback
                # If we resolved to a file but no specific member, checking if the imported name *is* the member in that file
                if not target_member:
                    # Case: import X.Y as Z -> imports[Z] = X.Y
                    # resolve(X.Y) -> file=X.py, member=Y. 
                    # Correct.
                    pass
                return self.find_model_fields(self.files[target_file], target_name, visited)

        return []

class FrameworkAdapter:
    """Adapts specific framework conventions (FastAPI, CrudAPIRouter) to generic route info."""
    
    SPECIAL_TYPES = {'Request', 'Response', 'BackgroundTasks', 'Session', 'AsyncSession', 'HTTPConnection', 'WebSocket', 'HTTPException'}

    def __init__(self, constants: Dict[str, str]):
        self.constants = constants

    def get_route_info(self, decorator: ast.Call, func_node: ast.FunctionDef) -> Optional[Tuple[str, str, Optional[str]]]:
        """
        Returns (method, path, response_model_arg_name) if valid route, else None.
        Path should be raw string or template.
        """
        fname = self._get_func_name(decorator.func)
        parts = fname.split('.')
        base = parts[0] if len(parts) > 1 else ""
        method_name = parts[-1]

        method = None
        path = ""
        resp_model_arg = "response_model"

        # Standard FastAPI: @app.get("/path")
        if method_name in ['get', 'post', 'put', 'delete', 'patch', 'options', 'head']:
            method = method_name.upper()
            if decorator.args:
                path = self._extract_str(decorator.args[0])
            else:
                path = self._extract_kwarg(decorator, "path", "")

        # Custom CrudAPIRouter: @router.register_create_schema(...)
        elif method_name.startswith('register_'):
            if 'create' in method_name: method, path = 'POST', "/"
            elif 'update' in method_name: method, path = 'PUT', "/{id}"
            elif 'delete' in method_name: method, path = 'DELETE', "/{id}"
            elif 'list' in method_name: method, path = 'GET', "/"; resp_model_arg = None # Implicit from args
            elif 'retrieve' in method_name: method, path = 'GET', "/{id}"; resp_model_arg = None

        # Custom Actions: @router.list_action, @router.get_action
        elif method_name in ['list_action', 'get_action', 'post_action', 'put_action']:
            if 'list' in method_name: method, path = 'GET', f"/{func_node.name}"
            elif 'get' in method_name: method, path = 'GET', f"/{{pk}}/{func_node.name}"
            elif 'post' in method_name: method, path = 'POST', f"/{func_node.name}"
            elif 'put' in method_name: method, path = 'PUT', f"/{{pk}}/{func_node.name}"
            resp_model_arg = "read_schema"

        # Generic Action: @router.action
        elif 'action' in method_name:
            # Default fallback for things like @router.custom_action
            if 'put' in method_name: method = 'PUT'
            elif 'post' in method_name: method = 'POST'
            else: method = 'GET'
            path = f"/{func_node.name}"
            resp_model_arg = "read_schema"

        if method:
            return method, path, resp_model_arg
        return None

    def get_router_init_params(self, node: ast.Call) -> Tuple[str, Optional[str], Optional[str]]:
        """Returns (prefix, parent_router_var, model_class_name)"""
        prefix = self._extract_kwarg(node, "prefix", "")
        # Handle f-string resolution in prefix? Handled by _extract_str
        prefix = str(self._extract_str(prefix)) if prefix else ""
        
        parent = self._extract_kwarg(node, "parent_router", None)
        parent_var = self._get_func_name(parent) if parent else None
        
        model_name = None
        if node.args and isinstance(node.args[0], ast.Name):
            model_name = node.args[0].id
            
        return prefix, parent_var, model_name

    def is_include_child_router(self, node: ast.Call) -> bool:
        fname = self._get_func_name(node.func)
        return fname.endswith("include_child_router")

    def _get_func_name(self, node):
        if isinstance(node, ast.Name): return node.id
        if isinstance(node, ast.Attribute): return f"{self._get_func_name(node.value)}.{node.attr}"
        return ""

    def _extract_kwarg(self, node, name, default):
        for k in node.keywords:
            if k.arg == name: return k.value
        return default

    def _extract_str(self, node):
        # Resolve constants
        if isinstance(node, (ast.Constant, ast.Str)): return str(node.value)
        if isinstance(node, ast.Name): return self.constants.get(node.id, node.id)
        if isinstance(node, ast.JoinedStr):
            res = ""
            for v in node.values:
                if isinstance(v, (ast.Constant, ast.Str)): res += str(v.value)
                elif isinstance(v, ast.FormattedValue):
                     # Resolve expressions like {version}
                     if isinstance(v.value, ast.Name):
                         res += self.constants.get(v.value.id, "{}")
                     else:
                         res += "{}"
            return res
        return ""

class FastAPIVisitor(ast.NodeVisitor):
    def __init__(self, file_data: FileData):
        self.data = file_data
        self.adapter = FrameworkAdapter(self.data.constants)
        self.current_route: Optional[RouteDef] = None
        self.include_child_calls: Set[str] = set()

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
                    self.adapter.constants[t.id] = val # Update adapter's view

        # 2. Router/App definition
        if isinstance(node.value, ast.Call):
            fname = self._get_func_name(node.value.func)
            for t in node.targets:
                if isinstance(t, ast.Name):
                    var_name = t.id
                    if fname.endswith("FastAPI"):
                        self.data.app_var = var_name
                        self.data.routers[var_name] = RouterDef(var_name)
                    elif fname.endswith("APIRouter") or fname.endswith("CrudAPIRouter"):
                        p, parent, model = self.adapter.get_router_init_params(node.value)
                        self.data.routers[var_name] = RouterDef(var_name, p, model, parent)
        
        self.generic_visit(node)

    def visit_ClassDef(self, node):
        # Basic model detection
        bases = [self._expression_to_str(b) for b in node.bases]
        is_model = any(
            any(k in b for k in ["BaseModel", "SQLModel", "Schema", "Model", "pydantic"]) 
            for b in bases
        )
        # Check table=True kwarg
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
        # Route detection via decorators
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call): continue
            
            route_info = self.adapter.get_route_info(decorator, node)
            if route_info:
                method, path, resp_arg = route_info
                
                # Identify router variable
                router_var = "app"
                fname = self._get_func_name(decorator.func)
                if '.' in fname:
                    router_var = fname.split('.')[0]

                route = RouteDef(path, method, router_var, node.lineno, self.data.file_path)
                
                # Extract Schema Info
                # 1. Request Body
                for arg in node.args.args:
                    if arg.arg == 'self': continue
                    if not arg.annotation: continue
                    type_name = self._get_base_type_name(arg.annotation)
                    if type_name not in self.adapter.SPECIAL_TYPES:
                        route.request_model_name = type_name
                        break # Assume first complex type is body
                
                # 2. Response Model
                if resp_arg:
                    resp_node = self._extract_kwarg(decorator, resp_arg, None)
                    if resp_node:
                         route.response_model_name = self._get_base_type_name(resp_node)
                
                # Fallback response from return annotation
                if not route.response_model_name and node.returns:
                    route.response_model_name = self._get_base_type_name(node.returns)

                # Register route
                if router_var not in self.data.routers:
                    self.data.routers[router_var] = RouterDef(router_var)
                self.data.routers[router_var].routes.append(route)
                
                self.current_route = route
                self.generic_visit(node)
                self.current_route = None
                return # Handled this function as a route

        # If not a route, visit children normally
        self.generic_visit(node)
    
    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_Call(self, node):
        fname = self._get_func_name(node.func)
        
        # 1. Dependency Analysis (only if in a route)
        if self.current_route:
            self._analyze_dependency(node, fname)

        # 2. Router inclusions
        if "include_router" in fname:
             # app.include_router(router, prefix=...)
             if '.' in fname:
                 caller = fname.split('.')[0]
                 if caller in self.data.routers:
                     included = self._get_func_name(node.args[0]) if node.args else None
                     prefix = self.adapter._extract_str(self._extract_kwarg(node, "prefix", ""))
                     if included:
                         self.data.routers[caller].includes.append(IncludeDef(included, prefix))

        # 3. Child router magic
        if self.adapter.is_include_child_router(node):
            if '.' in fname:
                caller = fname.split('.')[0]
                self.include_child_calls.add(caller)
                if caller in self.data.routers:
                    self.data.routers[caller].includes_children = True
        
        # 4. Schema registrations via method calls (register_list_schema etc)
        # These change the 'default' schema for the router references
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

    # --- Utils ---
    def _analyze_dependency(self, node, fname):
        is_db = ("session" in fname or "db" in fname or "repo" in fname) and \
                any(x in fname for x in ["exec", "add", "commit", "query", "get", "flush", "refresh"])
        if fname in ["select", "update", "delete", "insert"]: is_db = True
        
        if is_db:
             self._add_dep("database", "Database", fname)
             # Tables involved?
             for arg in node.args:
                 v = self._get_base_type_name(arg)
                 if v and v[0].isupper() and ("Model" in v or "Schema" in v):
                      if v not in self.current_route.dependencies["tables"]:
                           self.current_route.dependencies["tables"].append(v)
        
        if any(fname.startswith(x) for x in ["requests.", "httpx."]):
            self._add_dep("external", "External API", fname)
            if node.args:
                 url = self.adapter._extract_str(node.args[0])
                 if url and url not in self.current_route.dependencies["apiCalls"]:
                      self.current_route.dependencies["apiCalls"].append(url)

        # Service Detection
        # Check if call is to a module ending in _service
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
        # Strips List[], Optional[], etc to get the core model name
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

# --- Main Logic ---

class ProjectScanner:
    def __init__(self, path: str):
        self.root = Path(path).resolve()
        self.files: Dict[str, FileData] = {}
        self.endpoints: List[RouteDef] = []
        self.parent_child: Dict[str, List[str]] = {} # parent_id -> [child_id]
        self.global_includes_children: Set[str] = set()
        
        self.import_resolver = ImportResolver(self.root, self.files)
        self.type_resolver = TypeResolver(self.import_resolver, self.files)

    def scan(self):
        # 1. Parse all files
        for r, ds, fs in os.walk(self.root):
            if any(p.startswith('.') or p in ['__pycache__', 'node_modules', 'venv', 'env'] for p in Path(r).parts): continue
            for f in fs:
                if f.endswith('.py'):
                    full_path = Path(r) / f
                    rel_path = str(full_path.relative_to(self.root)).replace('\\', '/')
                    try:
                        with open(full_path, 'r', encoding='utf-8') as fobj:
                            source = fobj.read()
                            tree = ast.parse(source, filename=str(full_path))
                            fd = FileData(rel_path)
                            visitor = FastAPIVisitor(fd)
                            visitor.visit(tree)
                            self.files[rel_path] = fd
                            
                            # Collect global indicators
                            for c in visitor.include_child_calls:
                                resolved = self._resolve_local_var(fd, c)
                                self.global_includes_children.add(resolved)
                                
                    except Exception as e:
                        logging.error(f"Failed to parse {rel_path}: {e}")

        # 2. Build Hierarchy
        for fd in self.files.values():
            for r in fd.routers.values():
                if r.parent_var:
                    # Resolve parent variable to ID
                    parent_id = self._resolve_local_var(fd, r.parent_var)
                    child_id = f"{fd.file_path}:{r.var_name}"
                    
                    if parent_id not in self.parent_child:
                        self.parent_child[parent_id] = []
                    self.parent_child[parent_id].append(child_id)
                    logging.debug(f"Hierarchy: {parent_id} -> {child_id}")

    def resolve(self):
        # Start resolution from App OR from all routers if no app found
        apps = [(fd, fd.routers[fd.app_var]) for fd in self.files.values() if fd.app_var and fd.app_var in fd.routers]
        
        if not apps:
            logging.info("No main FastAPI app detected. Falling back to listing all routes.")
            for fd in self.files.values():
                for r in fd.routers.values():
                    for route in r.routes:
                        route.full_path = route.path
                        self._finalize_route(route)
                        self.endpoints.append(route)
        else:
            logging.info(f"Resolving from {len(apps)} entries.")
            for fd, r in apps:
                self._resolve_router(fd, r, "", set(), level=0)

    def _resolve_router(self, fd: FileData, r: RouterDef, prefix: str, visited: Set[str], level: int):
        router_id = f"{fd.file_path}:{r.var_name}"
        if router_id in visited: return
        visited.add(router_id)

        # Calculate current prefix
        # Combine incoming prefix + router's own prefix
        current_prefix = (prefix.rstrip('/') + '/' + r.prefix.lstrip('/')).rstrip('/')
        
        # 1. Process own routes
        for route in r.routes:
            # Combine current_prefix + route path
            full = (current_prefix.rstrip('/') + '/' + route.path.lstrip('/')).rstrip('/')
            route.full_path = full or "/"
            self._finalize_route(route)
            self.endpoints.append(route)

        # 2. Process Manual Includes
        for inc in r.includes:
             # inc.router_var -> resolve to File + RouterDef
             target_fd, target_router_def = self._resolve_router_ref(fd, inc.router_var)
             if target_fd and target_router_def:
                 new_prefix = (current_prefix.rstrip('/') + '/' + inc.prefix.lstrip('/')).rstrip('/')
                 self._resolve_router(target_fd, target_router_def, new_prefix, visited, level)

        # 3. Process Child Hierarchy (CrudAPIRouter magic)
        # Condition: Router has includes_children=True (locally or globally) AND has registered children
        is_magic = r.includes_children or (router_id in self.global_includes_children)
        if is_magic and router_id in self.parent_child:
            for child_id in self.parent_child[router_id]:
                # child_id formatted as "file:var"
                c_file, c_var = child_id.split(':')
                if c_file in self.files and c_var in self.files[c_file].routers:
                     # CrudAPIRouter appends /{pk} for next level
                     child_prefix = f"/{{p{level+1}_pk}}"
                     new_prefix = (current_prefix.rstrip('/') + child_prefix).rstrip('/')
                     self._resolve_router(self.files[c_file], self.files[c_file].routers[c_var], new_prefix, visited, level + 1)

    def _resolve_router_ref(self, fd: FileData, router_var: str) -> Tuple[Optional[FileData], Optional[RouterDef]]:
        # 1. Local
        if router_var in fd.routers:
            return fd, fd.routers[router_var]
        
        # 2. Imported
        if router_var in fd.imports:
            imp = fd.imports[router_var]
            fpath, member = self.import_resolver.resolve_module(imp, fd.file_path)
            if fpath and fpath in self.files:
                target_fd = self.files[fpath]
                # Member might be implicit (from file import router as r) -> member is 'router'
                # Or explicit (import file) -> member is router_var.split at end
                
                target_name = member if member else (imp.split('.')[-1])
                # Special case: from X import Y as Z. imports[Z] = X.Y. resolved(X.Y) -> file X.py, member Y.
                
                if target_name in target_fd.routers:
                    return target_fd, target_fd.routers[target_name]
        return None, None

    def _resolve_local_var(self, fd: FileData, var_name: str) -> str:
        """Returns fully qualified ID 'file:var' for any variable (local or imported)"""
        if var_name in fd.routers: # It is a local router
            return f"{fd.file_path}:{var_name}"
        
        if var_name in fd.imports:
            imp = fd.imports[var_name]
            fpath, member = self.import_resolver.resolve_module(imp, fd.file_path)
            if fpath:
                target_name = member if member else imp.split('.')[-1]
                return f"{fpath}:{target_name}"
        
        return f"{fd.file_path}:{var_name}" # Fallback
        
    def _finalize_route(self, route: RouteDef):
        # 1. Merge dependencies
        route.dependencies["grouped"] = (
            route.dependencies["services"] + 
            route.dependencies["database"] + 
            route.dependencies["external"] + 
            route.dependencies["utilities"]
        )
        
        # 2. Resolve Schemas
        fd = self.files[route.file_path]
        rdef = None
        if route.router_var in fd.routers:
             rdef = fd.routers[route.router_var]
        
        # Fallback to router defaults if None
        if not route.request_model_name and rdef:
             if route.method == 'POST' and route.path == "/": route.request_model_name = rdef.create_schema
             elif route.method == 'PUT' and route.path == "/{id}": route.request_model_name = rdef.update_schema
        
        if not route.response_model_name and rdef:
             if route.method == 'GET' and route.path == "/": route.response_model_name = rdef.list_schema
             elif route.method == 'GET' and route.path == "/{id}": route.response_model_name = rdef.retrieve_schema

        if route.request_model_name:
             route.request_schema = self.type_resolver.find_model_fields(fd, route.request_model_name)
        if route.response_model_name:
             route.response_schema = self.type_resolver.find_model_fields(fd, route.response_model_name)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("path")
    args = p.parse_args()
    
    scanner = ProjectScanner(args.path)
    scanner.scan()
    scanner.resolve()
    
    print(json.dumps([r.to_dict() for r in scanner.endpoints], indent=2))

if __name__ == "__main__":
    main()
