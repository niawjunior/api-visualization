"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCANNER_SCRIPT = void 0;
exports.SCANNER_SCRIPT = `import ast
import json
import os
import sys
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Set, Any

class RouteDef:
    def __init__(self, path: str, method: str, router_var: str, lineno: int, file_path: str):
        self.path = path
        self.method = method
        self.router_var = router_var
        self.lineno = lineno
        self.file_path = file_path
        self.full_path = "" # To be resolved
        # Dependencies
        self.dependencies = {
            "services": [],
            "database": [],
            "external": [],
            "utilities": [],
            "tables": [],    # Specific table names if detected
            "apiCalls": []   # Specific external endpoints if detected
        }

    def to_dict(self):
        return {
            "path": self.path,
            "method": self.method,
            "router_var": self.router_var,
            "lineno": self.lineno,
            "file_path": self.file_path,
            "full_path": self.full_path or self.path,
            "dependencies": self.dependencies
        }

class RouterDef:
    def __init__(self, var_name: str, prefix: str = "", is_crud: bool = False):
        self.var_name = var_name
        self.prefix = prefix
        self.includes: List['IncludeDef'] = []
        self.routes: List[RouteDef] = []
        self.is_crud = is_crud

class IncludeDef:
    def __init__(self, router_var: str, prefix: str = ""):
        self.router_var = router_var
        self.prefix = prefix

class FileData:
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.imports: Dict[str, str] = {} # var_name -> source_module
        self.routers: Dict[str, RouterDef] = {} # var_name -> RouterDef
        self.app_var: Optional[str] = None # Name of FastAPI instance, e.g. "app"

class FastAPIVisitor(ast.NodeVisitor):
    def __init__(self, file_data: FileData):
        self.data = file_data
        self.current_route: Optional[RouteDef] = None
        self.current_function = None

    def visit_Import(self, node):
        for alias in node.names:
            var_name = alias.asname or alias.name
            self.data.imports[var_name] = alias.name
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        module = node.module or ""
        for alias in node.names:
            var_name = alias.asname or alias.name
            full_source = f"{module}.{alias.name}" if module else alias.name
            self.data.imports[var_name] = full_source
        self.generic_visit(node)

    def visit_Assign(self, node):
        # Check for app = FastAPI() or router = APIRouter()
        if not isinstance(node.value, ast.Call):
            return
        
        call = node.value
        func_name = self._get_func_name(call.func)
        
        target_name = ""
        if node.targets and isinstance(node.targets[0], ast.Name):
            target_name = node.targets[0].id
        
        if not target_name:
            return

        target_names = []
        for target in node.targets:
             if isinstance(target, ast.Name):
                 target_names.append(target.id)

        is_fastapi = func_name.endswith("FastAPI")
        is_router = func_name.endswith("APIRouter")
        is_crud = func_name.endswith("CrudAPIRouter")

        if is_fastapi:
            for name in target_names:
                self.data.app_var = name
                self.data.routers[name] = RouterDef(name, prefix="")
        
        elif is_router or is_crud:
            prefix = self._extract_kwarg(call, "prefix", "")
            for name in target_names:
                router = RouterDef(name, prefix=prefix, is_crud=is_crud)
                if is_crud:
                    # Heuristic: Add standard CRUD placeholders which might be updated later
                    router.routes.append(RouteDef("/", "GET", name, node.lineno, self.data.file_path))
                    router.routes.append(RouteDef("/{id}", "GET", name, node.lineno, self.data.file_path))
                    router.routes.append(RouteDef("/", "POST", name, node.lineno, self.data.file_path))
                    router.routes.append(RouteDef("/{id}", "PUT", name, node.lineno, self.data.file_path))
                    router.routes.append(RouteDef("/{id}", "DELETE", name, node.lineno, self.data.file_path))
                
                self.data.routers[name] = router

        self.generic_visit(node)

    def visit_Call(self, node):
        func_name = self._get_func_name(node.func)
        
        # 1. Router inclusion
        if "include_router" in func_name or "include_child_router" in func_name:
            caller = self._get_caller_name(node.func)
            if caller and caller in self.data.routers:
                parent_router = self.data.routers[caller]
                child_var = ""
                if node.args:
                    arg0 = node.args[0]
                    if isinstance(arg0, ast.Name):
                        child_var = arg0.id
                prefix = self._extract_kwarg(node, "prefix", "")
                if child_var:
                    parent_router.includes.append(IncludeDef(child_var, prefix))

        # 2. Dependency Detection
        if self.current_route:
            self._analyze_dependency(node, func_name)

        self.generic_visit(node)
        
    def _analyze_dependency(self, node, func_name):
        # Database
        is_db = False
        if "session" in func_name or "db" in func_name or "repository" in func_name:
            if "exec" in func_name or "add" in func_name or "commit" in func_name or "query" in func_name:
                is_db = True
        
        if func_name in ["select", "update", "delete", "insert"]:
            is_db = True
        
        if "sqlmodel_wrapper" in func_name:
             self._add_dep("database", "SQLModel", func_name)

        if is_db:
             self._add_dep("database", "Database", func_name)
             # Try to extract table/model names from args (e.g. select(Model))
             for arg in node.args:
                 val = self._expression_to_str(arg)
                 if val and val[0].isupper() and "Model" in val: # Heuristic for Model classes
                     if val not in self.current_route.dependencies["tables"]:
                          self.current_route.dependencies["tables"].append(val)

        # External APIs
        if func_name.startswith("requests.") or func_name.startswith("httpx.") or func_name.startswith("aiohttp."):
            self._add_dep("external", "External API", func_name)
            if node.args:
                url = self._extract_str(node.args[0])
                if url and url not in self.current_route.dependencies["apiCalls"]:
                    self.current_route.dependencies["apiCalls"].append(url)

        # Services
        parts = func_name.split('.')
        if len(parts) > 1:
            obj_name = parts[0]
            if "service" in obj_name.lower() or "client" in obj_name.lower():
                self._add_dep("services", obj_name, func_name)
            
            if obj_name in self.data.imports:
                source = self.data.imports[obj_name]
                if "service" in source.lower():
                     self._add_dep("services", source, func_name)

    def _add_dep(self, category, module, item):
        for dep in self.current_route.dependencies[category]:
            if dep["module"] == module:
                if item not in dep["items"]:
                    dep["items"].append(item)
                    dep["count"] += 1
                return
        
        self.current_route.dependencies[category].append({
            "module": module,
            "moduleLabel": module,
            "type": category,
            "items": [item],
            "count": 1
        })

    def visit_FunctionDef(self, node):
        is_route = False
        router_var = None
        method = None
        path = ""
        is_override = False

        for decorator in node.decorator_list:
            if isinstance(decorator, ast.Call):
                func_name = self._get_func_name(decorator.func)
                parts = func_name.split('.')
                if len(parts) >= 2:
                    r_var = parts[0]
                    m_str = parts[-1]
                    
                    if m_str in ['get', 'post', 'put', 'delete', 'patch', 'options', 'head']:
                        is_route = True
                        router_var = r_var
                        method = m_str.upper()
                        if decorator.args: path = self._extract_str(decorator.args[0])
                        if not path: path = self._extract_kwarg(decorator, "path", "")
                    
                    # Custom CrudAPIRouter Methods & Overrides
                    elif m_str == 'put_action': is_route=True; router_var=r_var; method='PUT'; path=f"/{{id}}/{node.name}" 
                    elif m_str == 'post_action': is_route=True; router_var=r_var; method='POST'; path=f"/{{id}}/{node.name}"
                    elif m_str == 'get_action': is_route=True; router_var=r_var; method='GET'; path=f"/{{id}}/{node.name}"
                    elif m_str == 'register_custom_filter':
                        is_route=True; router_var=r_var; method='GET'
                        filter_name = ""
                        if decorator.args: filter_name = self._extract_str(decorator.args[0])
                        path = f"/filter/{filter_name}"
                    
                    # Overrides - Map to standard CRUD paths
                    elif m_str == 'register_retrieve_schema': is_route=True; is_override=True; router_var=r_var; method='GET'; path="/{id}"
                    elif m_str == 'register_list_schema': is_route=True; is_override=True; router_var=r_var; method='GET'; path="/"
                    elif m_str == 'register_create_schema': is_route=True; is_override=True; router_var=r_var; method='POST'; path="/"
                    elif m_str == 'register_update_schema': is_route=True; is_override=True; router_var=r_var; method='PUT'; path="/{id}"
                    elif m_str == 'register_delete_schema': is_route=True; is_override=True; router_var=r_var; method='DELETE'; path="/{id}"

                    if is_route: break

        if is_route and method and router_var:
            # Check if route already exists (especially for overrides)
            existing_route = None
            if router_var in self.data.routers:
                for r in self.data.routers[router_var].routes:
                    if r.method == method and r.path == path:
                        existing_route = r
                        break
            
            if existing_route:
                # Update existing route's location to the override/handler
                existing_route.lineno = node.lineno
                # We want to scan THIS function body for dependencies for this route
                self.current_route = existing_route
            else:
                # Create new
                route = RouteDef(path, method, router_var, node.lineno, self.data.file_path)
                if router_var in self.data.routers:
                    self.data.routers[router_var].routes.append(route)
                else:
                    if router_var not in self.data.routers:
                        self.data.routers[router_var] = RouterDef(router_var)
                    self.data.routers[router_var].routes.append(route)
                self.current_route = route
            
            self.current_function = node.name
            self.generic_visit(node)
            self.current_route = None
            self.current_function = None
        else:
            self.generic_visit(node)

    visit_AsyncFunctionDef = visit_FunctionDef

    def _get_func_name(self, node):
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{self._get_func_name(node.value)}.{node.attr}"
        return ""
    
    def _expression_to_str(self, node):
        if isinstance(node, ast.Name): return node.id
        if isinstance(node, ast.Attribute): return f"{self._expression_to_str(node.value)}.{node.attr}"
        if isinstance(node, ast.Call): return self._expression_to_str(node.func) # Just naming the function called
        return ""

    def _get_caller_name(self, node):
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            return node.value.id
        return None

    def _extract_kwarg(self, node, arg_name, default):
        for keyword in node.keywords:
            if keyword.arg == arg_name:
                return self._extract_str(keyword.value) or default
        return default

    def _extract_str(self, node):
        if isinstance(node, ast.Constant): # Python 3.8+
            return str(node.value)
        elif isinstance(node, ast.Str): # Older
            return node.s
        return ""

class ProjectScanner:
    def __init__(self, root_path: str):
        self.root_path = Path(root_path)
        self.files: Dict[str, FileData] = {}
        self.endpoints = []

    def scan(self):
        for root, dirs, files in os.walk(self.root_path):
            if any(part.startswith('.') or part in ['__pycache__', 'node_modules', 'venv', 'env'] for part in Path(root).parts):
                continue
            
            for file in files:
                if file.endswith('.py'):
                    full_path = str(Path(root) / file)
                    rel_path = str(Path(full_path).relative_to(self.root_path))
                    self._parse_file(full_path, rel_path)

    def _parse_file(self, full_path: str, rel_path: str):
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
            tree = ast.parse(content, filename=full_path)
            file_data = FileData(rel_path)
            visitor = FastAPIVisitor(file_data)
            visitor.visit(tree)
            self.files[rel_path] = file_data
        except Exception:
            pass

    def resolve(self):
        apps = []
        for file_data in self.files.values():
            if file_data.app_var and file_data.app_var in file_data.routers:
                apps.append((file_data, file_data.routers[file_data.app_var]))

        if not apps:
            self.endpoints = self._flatten_all_routes()
            return

        resolved_endpoints = []
        for file_data, app_router in apps:
             self._resolve_router(file_data, app_router, "", resolved_endpoints, set())

        self.endpoints = resolved_endpoints

    def _resolve_router(self, file_data: FileData, router: RouterDef, current_prefix: str, results: List, visited: Set[str]):
        router_id = f"{file_data.file_path}:{router.var_name}"
        if router_id in visited:
            return
        visited.add(router_id)

        combined_prefix = (current_prefix.rstrip('/') + '/' + router.prefix.lstrip('/')).rstrip('/')
        if not combined_prefix: combined_prefix = "/"
        
        for route in router.routes:
            final_path = (combined_prefix.rstrip('/') + '/' + route.path.lstrip('/')).rstrip('/')
            if not final_path: final_path = "/"
            route.full_path = final_path
            
            route.dependencies["grouped"] = (
                route.dependencies["services"] +
                route.dependencies["database"] +
                route.dependencies["external"] +
                route.dependencies["utilities"]
            )
            
            results.append(route.to_dict())

        for include in router.includes:
            child_router_name = include.router_var
            child_prefix = include.prefix
            next_prefix = (combined_prefix.rstrip('/') + '/' + child_prefix.lstrip('/')).rstrip('/')
            
            if child_router_name in file_data.routers:
                self._resolve_router(file_data, file_data.routers[child_router_name], next_prefix, results, visited)
            elif child_router_name in file_data.imports:
                import_src = file_data.imports[child_router_name]
                target_file, target_var = self._resolve_module(import_src)
                if target_file and target_file in self.files:
                    target_file_data = self.files[target_file]
                    if target_var and target_var in target_file_data.routers:
                         self._resolve_router(target_file_data, target_file_data.routers[target_var], next_prefix, results, visited)

    def _resolve_module(self, module_str: str):
        parts = module_str.split('.')
        for i in range(len(parts), 0, -1):
            file_parts = parts[:i]
            var_parts = parts[i:]
            
            rel_path_py = os.path.join(*file_parts) + ".py"
            rel_path_init = os.path.join(*file_parts, "__init__.py")
            
            candidate = None
            if rel_path_py in self.files:
                candidate = rel_path_py
            elif rel_path_init in self.files:
                candidate = rel_path_init
                
            if candidate:
                 target_var = var_parts[0] if var_parts else None
                 return candidate, target_var  
        return None, None

    def _flatten_all_routes(self):
        all_routes = []
        for file_data in self.files.values():
            for router in file_data.routers.values():
                for route in router.routes:
                    route.full_path = route.path
                    route.dependencies["grouped"] = (
                        route.dependencies["services"] +
                        route.dependencies["database"] +
                        route.dependencies["external"] +
                        route.dependencies["utilities"]
                    )
                    all_routes.append(route.to_dict())
        return all_routes

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("path", help="Project root path")
    args = parser.parse_args()
    
    scanner = ProjectScanner(args.path)
    scanner.scan()
    scanner.resolve()
    
    print(json.dumps(scanner.endpoints, indent=2))

if __name__ == "__main__":
    main()
`;
