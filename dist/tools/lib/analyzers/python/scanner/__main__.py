import argparse
import os
import json
import logging
import ast
from pathlib import Path
from typing import Dict, List, Set, Tuple, Optional

from .core.models import FileData, RouteDef, RouterDef
from .core.resolver import ImportResolver, TypeResolver
from .core.visitor import ASTVisitor
from .adapters.fastapi import FastAPIAdapter
from .adapters.custom import CustomAdapter

# Setup logging
logging.basicConfig(
    filename='scanner_debug.log',
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

class ProjectScanner:
    def __init__(self, path: str):
        self.root = Path(path).resolve()
        self.files: Dict[str, FileData] = {}
        self.endpoints: List[RouteDef] = []
        self.parent_child: Dict[str, List[str]] = {} 
        self.global_includes_children: Set[str] = set()
        
        self.import_resolver = ImportResolver(self.root, self.files)
        # Type resolver initialized after file scan or lazily
        self.type_resolver = None 

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
                            
                            # Initialize Adapters with shared constants context
                            adapters = [
                                CustomAdapter(fd.constants),
                                FastAPIAdapter(fd.constants)
                            ]
                            
                            visitor = ASTVisitor(fd, adapters)
                            visitor.visit(tree)
                            self.files[rel_path] = fd
                            
                            for c in visitor.include_child_calls:
                                resolved = self._resolve_local_var(fd, c)
                                self.global_includes_children.add(resolved)
                                
                    except Exception as e:
                        logging.error(f"Failed to parse {rel_path}: {e}")

        self.type_resolver = TypeResolver(self.import_resolver, self.files)

        # 2. Build Hierarchy
        for fd in self.files.values():
            for r in fd.routers.values():
                if r.parent_var:
                    parent_id = self._resolve_local_var(fd, r.parent_var)
                    child_id = f"{fd.file_path}:{r.var_name}"
                    
                    if parent_id not in self.parent_child:
                        self.parent_child[parent_id] = []
                    self.parent_child[parent_id].append(child_id)

    def resolve(self):
        apps = [(fd, fd.routers[fd.app_var]) for fd in self.files.values() if fd.app_var and fd.app_var in fd.routers]
        
        if not apps:
            for fd in self.files.values():
                for r in fd.routers.values():
                    for route in r.routes:
                        route.full_path = route.path
                        self._finalize_route(route)
                        self.endpoints.append(route)
        else:
            for fd, r in apps:
                self._resolve_router(fd, r, "", set(), level=0)

    def _resolve_router(self, fd: FileData, r: RouterDef, prefix: str, visited: Set[str], level: int):
        router_id = f"{fd.file_path}:{r.var_name}"
        if router_id in visited: return
        visited.add(router_id)

        current_prefix = (prefix.rstrip('/') + '/' + r.prefix.lstrip('/')).rstrip('/')
        
        for route in r.routes:
            full = (current_prefix.rstrip('/') + '/' + route.path.lstrip('/')).rstrip('/')
            route.full_path = full or "/"
            self._finalize_route(route)
            self.endpoints.append(route)

        for inc in r.includes:
             target_fd, target_router_def = self._resolve_router_ref(fd, inc.router_var)
             if target_fd and target_router_def:
                 new_prefix = (current_prefix.rstrip('/') + '/' + inc.prefix.lstrip('/')).rstrip('/')
                 self._resolve_router(target_fd, target_router_def, new_prefix, visited, level)

        is_magic = r.includes_children or (router_id in self.global_includes_children)
        if is_magic and router_id in self.parent_child:
            for child_id in self.parent_child[router_id]:
                c_file, c_var = child_id.split(':')
                if c_file in self.files and c_var in self.files[c_file].routers:
                     child_prefix = f"/{{p{level+1}_pk}}"
                     new_prefix = (current_prefix.rstrip('/') + child_prefix).rstrip('/')
                     self._resolve_router(self.files[c_file], self.files[c_file].routers[c_var], new_prefix, visited, level + 1)

    def _resolve_router_ref(self, fd: FileData, router_var: str) -> Tuple[Optional[FileData], Optional[RouterDef]]:
        if router_var in fd.routers:
            return fd, fd.routers[router_var]
        
        if router_var in fd.imports:
            imp = fd.imports[router_var]
            fpath, member = self.import_resolver.resolve_module(imp, fd.file_path)
            if fpath and fpath in self.files:
                target_fd = self.files[fpath]
                target_name = member if member else (imp.split('.')[-1])
                if target_name in target_fd.routers:
                    return target_fd, target_fd.routers[target_name]
        return None, None

    def _resolve_local_var(self, fd: FileData, var_name: str) -> str:
        if var_name in fd.routers:
            return f"{fd.file_path}:{var_name}"
        
        if var_name in fd.imports:
            imp = fd.imports[var_name]
            fpath, member = self.import_resolver.resolve_module(imp, fd.file_path)
            if fpath:
                target_name = member if member else imp.split('.')[-1]
                return f"{fpath}:{target_name}"
        return f"{fd.file_path}:{var_name}"
        
    def _finalize_route(self, route: RouteDef):
        route.dependencies["grouped"] = (
            route.dependencies["services"] + 
            route.dependencies["database"] + 
            route.dependencies["external"] + 
            route.dependencies["utilities"]
        )
        
        fd = self.files[route.file_path]
        rdef = None
        if route.router_var in fd.routers:
             rdef = fd.routers[route.router_var]
        
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
