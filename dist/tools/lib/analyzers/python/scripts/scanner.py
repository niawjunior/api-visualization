import ast
import json
import os
import sys
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Set, Any
import logging

# Setup logging
logging.basicConfig(
    filename='scanner_debug.log',
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

class SchemaField:
    def __init__(self, name: str, type_name: str, required: bool):
        self.name = name
        self.type_name = type_name
        self.required = required

    def to_dict(self):
        return {
            "name": self.name,
            "type": self.type_name,
            "required": self.required
        }

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
            "tables": [],
            "apiCalls": []
        }
        # Schemas
        self.request_schema: List[SchemaField] = []
        self.response_schema: List[SchemaField] = []
        
        # Unresolved schema names
        self.request_model_name: Optional[str] = None
        self.response_model_name: Optional[str] = None

    def to_dict(self):
        return {
            "path": self.path,
            "method": self.method,
            "router_var": self.router_var,
            "lineno": self.lineno,
            "file_path": self.file_path,
            "full_path": self.full_path or self.path,
            "dependencies": self.dependencies,
            "request_schema": [f.to_dict() for f in self.request_schema],
            "response_schema": [f.to_dict() for f in self.response_schema]
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
        self.routers: Dict[str, RouterDef] = {} 
        self.app_var: Optional[str] = None
        self.models: Dict[str, List[SchemaField]] = {} 

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
        level = node.level or 0
        
        # Determine source path for relative imports
        if level > 0:
            # Resolving relative imports is hard without full context of file location 
            # relative to root package.
            # However, we can store it as ".module" or "..module"
            prefix = "." * level
            source_base = f"{prefix}{module}" if module else prefix
        else:
            source_base = module

        for alias in node.names:
            var_name = alias.asname or alias.name
            if source_base:
                self.data.imports[var_name] = f"{source_base}.{alias.name}"
            else:
                self.data.imports[var_name] = alias.name
        self.generic_visit(node)

    def visit_ClassDef(self, node):
        is_model = False
        for base in node.bases:
            base_name = self._expression_to_str(base)
            if any(x in base_name for x in ["BaseModel", "SQLModel", "Schema", "pydantic"]):
                is_model = True
                break
        
        if is_model:
            fields = []
            for item in node.body:
                if isinstance(item, ast.AnnAssign):
                     if isinstance(item.target, ast.Name):
                         field_name = item.target.id
                         type_name = self._expression_to_str(item.annotation)
                         required = item.value is None
                         fields.append(SchemaField(field_name, type_name, required))
            self.data.models[node.name] = fields
            logging.debug(f"Found model: {node.name} in {self.data.file_path} with {len(fields)} fields")
            
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        is_route = False
        router_var = None
        method = None
        path = ""
        response_model_name = None

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
                        response_model_name = self._extract_kwarg(decorator, "response_model", None)
                    
                    # Custom Actions support (simplified)
                    elif 'action' in m_str or 'register' in m_str:
                         is_route = True
                         router_var = r_var
                         method = 'POST' if 'post' in m_str else 'GET'
                         path = f"/{node.name}" # simplified

                    if is_route: break

        if is_route and method and router_var:
            route = RouteDef(path, method, router_var, node.lineno, self.data.file_path)
            if router_var not in self.data.routers:
                 self.data.routers[router_var] = RouterDef(router_var)
            self.data.routers[router_var].routes.append(route)
            
            # --- Schema Analysis ---
            for arg in node.args.args:
                if arg.arg in ['self', 'request', 'background_tasks', 'response']: continue
                if not arg.annotation: continue
                type_name = self._expression_to_str(arg.annotation)
                route.request_model_name = type_name
                if type_name in self.data.models:
                    route.request_schema = self.data.models[type_name]
                
            if response_model_name:
                route.response_model_name = response_model_name
                if response_model_name in self.data.models:
                    route.response_schema = self.data.models[response_model_name]
            elif node.returns: 
                 ret_type = self._expression_to_str(node.returns)
                 route.response_model_name = ret_type
                 if ret_type in self.data.models:
                     route.response_schema = self.data.models[ret_type]

            self.current_route = route
            self.current_function = node.name
            self.generic_visit(node)
            self.current_route = None
            self.current_function = None
        else:
            self.generic_visit(node)

    visit_AsyncFunctionDef = visit_FunctionDef

    def _get_func_name(self, node):
        if isinstance(node, ast.Name): return node.id
        elif isinstance(node, ast.Attribute): return f"{self._get_func_name(node.value)}.{node.attr}"
        return ""
    
    def _expression_to_str(self, node):
        if isinstance(node, ast.Name): return node.id
        if isinstance(node, ast.Attribute): return f"{self._expression_to_str(node.value)}.{node.attr}"
        if isinstance(node, ast.Call): return self._expression_to_str(node.func)
        if isinstance(node, ast.Subscript): return self._expression_to_str(node.value)
        return ""

    def _get_caller_name(self, node):
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name): return node.value.id
        return None

    def _extract_kwarg(self, node, arg_name, default):
        for keyword in node.keywords:
            if keyword.arg == arg_name: return self._extract_str(keyword.value) or default
        return default

    def _extract_str(self, node):
        if isinstance(node, ast.Constant): return str(node.value)
        elif isinstance(node, ast.Str): return node.s
        elif isinstance(node, ast.Name): return node.id
        return ""
    
    def visit_Call(self, node):
        func_name = self._get_func_name(node.func)
        if "include_router" in func_name:
             caller = self._get_caller_name(node.func)
             if caller and caller in self.data.routers:
                parent_router = self.data.routers[caller]
                child_var = ""
                if node.args and isinstance(node.args[0], ast.Name): child_var = node.args[0].id
                prefix = self._extract_kwarg(node, "prefix", "")
                if child_var: parent_router.includes.append(IncludeDef(child_var, prefix))
        
        if self.current_route:
            self._analyze_dependency(node, func_name)
        self.generic_visit(node)

    def visit_Assign(self, node):
        if not isinstance(node.value, ast.Call): return
        call = node.value
        func_name = self._get_func_name(call.func)
        target_names = [t.id for t in node.targets if isinstance(t, ast.Name)]
        
        is_fastapi = func_name.endswith("FastAPI")
        is_router = func_name.endswith("APIRouter") or func_name.endswith("CrudAPIRouter")
        
        if is_fastapi:
            for name in target_names:
                self.data.app_var = name
                self.data.routers[name] = RouterDef(name)
        elif is_router:
            prefix = self._extract_kwarg(call, "prefix", "")
            for name in target_names:
                self.data.routers[name] = RouterDef(name, prefix)
        self.generic_visit(node)

    def _analyze_dependency(self, node, func_name):
        is_db = False
        if "session" in func_name or "db" in func_name or "repository" in func_name:
            if "exec" in func_name or "add" in func_name or "commit" in func_name or "query" in func_name: is_db = True
        if func_name in ["select", "update", "delete", "insert"]: is_db = True
        if "sqlmodel_wrapper" in func_name: self._add_dep("database", "SQLModel", func_name)
        if is_db: 
            self._add_dep("database", "Database", func_name)
            for arg in node.args:
                 val = self._expression_to_str(arg)
                 if val and val[0].isupper() and "Model" in val: 
                     if val not in self.current_route.dependencies["tables"]: self.current_route.dependencies["tables"].append(val)
        if func_name.startswith("requests.") or func_name.startswith("httpx."):
            self._add_dep("external", "External API", func_name)
            if node.args:
                url = self._extract_str(node.args[0])
                if url and url not in self.current_route.dependencies["apiCalls"]: self.current_route.dependencies["apiCalls"].append(url)
        
        parts = func_name.split('.')
        if len(parts) > 1:
            obj_name = parts[0]
            if "service" in obj_name.lower(): self._add_dep("services", obj_name, func_name)
            if obj_name in self.data.imports:
                source = self.data.imports[obj_name]
                if "service" in source.lower(): self._add_dep("services", source, func_name)

    def _add_dep(self, category, module, item):
        for dep in self.current_route.dependencies[category]:
            if dep["module"] == module:
                if item not in dep["items"]: dep["items"].append(item)
                return
        self.current_route.dependencies[category].append({"module": module, "moduleLabel": module, "type": category, "items": [item], "count": 1})

class ProjectScanner:
    def __init__(self, root_path: str):
        self.root_path = Path(root_path)
        self.files: Dict[str, FileData] = {}
        self.endpoints = []

    def scan(self):
        logging.info(f"Scanning root: {self.root_path}")
        for root, dirs, files in os.walk(self.root_path):
            if any(part.startswith('.') or part in ['__pycache__', 'node_modules', 'venv', 'env'] for part in Path(root).parts): continue
            for file in files:
                if file.endswith('.py'):
                    full_path = str(Path(root) / file)
                    try:
                        rel_path = str(Path(full_path).relative_to(self.root_path))
                        # logging.debug(f"Parsing {rel_path}")
                        self._parse_file(full_path, rel_path)
                    except ValueError:
                        logging.warning(f"Could not make rel path for {full_path}")

    def _parse_file(self, full_path: str, rel_path: str):
        try:
            with open(full_path, 'r', encoding='utf-8') as f: content = f.read()
            tree = ast.parse(content, filename=full_path)
            file_data = FileData(rel_path)
            visitor = FastAPIVisitor(file_data)
            visitor.visit(tree)
            self.files[rel_path] = file_data
        except Exception as e:
            logging.error(f"Error parsing {rel_path}: {e}")

    def resolve(self):
        logging.info("Starting resolution")
        apps = []
        for file_data in self.files.values():
            if file_data.app_var and file_data.app_var in file_data.routers:
                apps.append((file_data, file_data.routers[file_data.app_var]))
        
        if not apps:
            self.endpoints = self._flatten_all_routes()
        else:
            resolved_endpoints = []
            for file_data, app_router in apps:
                 self._resolve_router(file_data, app_router, "", resolved_endpoints, set())
            self.endpoints = resolved_endpoints
            
        logging.info(f"Found {len(self.endpoints)} endpoints. Resolving schemas...")
        self._resolve_all_schemas(self.endpoints)

    def _flatten_all_routes(self):
        res = []
        for file_data in self.files.values():
            for router in file_data.routers.values():
                for route in router.routes:
                    route.full_path = route.path
                    self._merge_deps(route)
                    res.append(route)
        return res

    def _resolve_router(self, file_data: FileData, router: RouterDef, current_prefix: str, results: List, visited: Set[str]):
        router_id = f"{file_data.file_path}:{router.var_name}"
        if router_id in visited: return
        visited.add(router_id)

        combined_prefix = (current_prefix.rstrip('/') + '/' + router.prefix.lstrip('/')).rstrip('/')
        if not combined_prefix: combined_prefix = "/"
        
        for route in router.routes:
            final_path = (combined_prefix.rstrip('/') + '/' + route.path.lstrip('/')).rstrip('/')
            if not final_path: final_path = "/"
            route.full_path = final_path
            self._merge_deps(route)
            results.append(route)

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

    def _merge_deps(self, route):
        route.dependencies["grouped"] = (
            route.dependencies["services"] +
            route.dependencies["database"] +
            route.dependencies["external"] +
            route.dependencies["utilities"]
        )

    def _resolve_all_schemas(self, routes: List[RouteDef]):
        for route in routes:
            file_data = self.files[route.file_path]
            
            if not route.request_schema and route.request_model_name:
                logging.debug(f"Resolving request schema {route.request_model_name} for {route.path}")
                route.request_schema = self._find_model(file_data, route.request_model_name)
            
            if not route.response_schema and route.response_model_name:
                logging.debug(f"Resolving response schema {route.response_model_name} for {route.path}")
                route.response_schema = self._find_model(file_data, route.response_model_name)

    def _find_model(self, file_data: FileData, model_name: str, chain=None) -> List[SchemaField]:
        if chain is None: chain = set()
        if model_name in chain: return []
        chain.add(model_name)
        
        # 1. Check local models
        if model_name in file_data.models:
            logging.debug(f"Found {model_name} in {file_data.file_path}")
            return file_data.models[model_name]
        
        # 2. Check imports
        if model_name in file_data.imports:
            import_src = file_data.imports[model_name]
            # logging.debug(f"Model {model_name} is imported from {import_src}")
            
            target_file, target_var = self._resolve_module(import_src)
            if target_file and target_file in self.files and target_var:
                # logging.debug(f"Resolved to file {target_file}, var {target_var}")
                target_data = self.files[target_file]
                return self._find_model(target_data, target_var, chain)
            else:
                 pass
                 # logging.debug(f"Could not resolve import {import_src}")
                
        return []

    def _resolve_module(self, module_str: str):
        parts = module_str.split('.')
        # Handle relative imports inside the parts (not really possible here since we resolved to abs in visit_ImportFrom, potentially)
        # But if module_str starts with dot, we fail currently.
        
        for i in range(len(parts), 0, -1):
            file_parts = parts[:i]
            var_parts = parts[i:]
            
            rel_path_py = os.path.join(*file_parts) + ".py"
            rel_path_init = os.path.join(*file_parts, "__init__.py")
            
            candidate = None
            if rel_path_py in self.files: candidate = rel_path_py
            elif rel_path_init in self.files: candidate = rel_path_init
            
            if candidate:
                 target_var = var_parts[0] if var_parts else None
                 return candidate, target_var  
        return None, None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("path", help="Project root path")
    args = parser.parse_args()
    
    scanner = ProjectScanner(args.path)
    scanner.scan()
    scanner.resolve()
    
    final_output = [r.to_dict() for r in scanner.endpoints]
    print(json.dumps(final_output, indent=2))

if __name__ == "__main__":
    main()
