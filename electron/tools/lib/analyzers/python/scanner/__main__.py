import argparse
import os
import json
import logging
import ast
import warnings
from pathlib import Path
from typing import Dict, List, Set, Tuple, Optional

# Suppress SyntaxWarnings from ast.parse() on Python 3.12+ (invalid escape sequences in scanned code)
warnings.filterwarnings("ignore", category=SyntaxWarning)

from .core.models import FileData, RouteDef, RouterDef, IncludeDef
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
        self.errors: List[Dict[str, str]] = []
        
        self.import_resolver = ImportResolver(self.root, self.files)
        # Type resolver initialized after file scan or lazily
        self.type_resolver = None
        self.canonical_map = {}  # maps "file:alias_key" -> "file:canonical_key"

    def scan(self, deps_only: bool = False):
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
                            
                            if deps_only:
                                # Lightweight scan
                                from .core.visitor import ImportVisitor
                                visitor = ImportVisitor(fd)
                                visitor.visit(tree)
                            else:
                                # Full scan
                                adapters = [
                                    CustomAdapter(fd.constants),
                                    FastAPIAdapter(fd.constants)
                                ]
                                visitor = ASTVisitor(fd, adapters)
                                visitor.visit(tree)
                                
                                for c in visitor.include_child_calls:
                                    resolved = self._resolve_local_var(fd, c)
                                    self.global_includes_children.add(resolved)
                            
                            self.files[rel_path] = fd
                                
                    except Exception as e:
                        self.errors.append({"file": rel_path, "error": str(e)})
                        logging.error(f"Failed to parse {rel_path}: {e}")

        self.type_resolver = TypeResolver(self.import_resolver, self.files)

        if not deps_only:
            # 2a. Expand factory-created routers using cross-file dict resolution
            self._expand_factory_routers()
            # 2b. Generate implicit CRUD routes for CrudAPIRouters with schemas but no routes
            self._generate_implicit_crud_routes()
            # 2c. Resolve dict-based include_router loops
            self._resolve_dict_includes()

        # 2a. Build canonical name map for shared RouterDefs (chained assignments like a = b = Router())
        for fd in self.files.values():
            id_to_canonical = {}
            for var_name, r in fd.routers.items():
                rid = id(r)
                if rid not in id_to_canonical:
                    id_to_canonical[rid] = var_name  # first key is canonical
                full_key = f"{fd.file_path}:{var_name}"
                canonical_key = f"{fd.file_path}:{id_to_canonical[rid]}"
                if full_key != canonical_key:
                    self.canonical_map[full_key] = canonical_key

        # 2b. Build Hierarchy
        for fd in self.files.values():
            seen_router_ids = set()
            for r in fd.routers.values():
                if id(r) in seen_router_ids:
                    continue
                seen_router_ids.add(id(r))
                if r.parent_var:
                    parent_id = self._resolve_local_var(fd, r.parent_var)
                    parent_id = self.canonical_map.get(parent_id, parent_id)
                    child_id = f"{fd.file_path}:{r.var_name}"
                    child_id = self.canonical_map.get(child_id, child_id)

                    if parent_id not in self.parent_child:
                        self.parent_child[parent_id] = []
                    if child_id not in self.parent_child[parent_id]:
                        self.parent_child[parent_id].append(child_id)

    def _expand_factory_routers(self):
        """Expand single factory-created routers into multiple routers using cross-file dict data."""
        import re
        for fd in list(self.files.values()):
            factory_routers = [(k, r) for k, r in fd.routers.items() if '__factory_0' in k]
            for factory_key, factory_rdef in factory_routers:
                base_name = factory_key.replace('__factory_0', '')

                # Find the for-loop that created this factory router
                # Look for the iterable dict name in imports
                # We need to find a dict literal from another file
                for imp_name, imp_path in fd.imports.items():
                    fpath, member = self.import_resolver.resolve_module(imp_path, fd.file_path)
                    if not fpath or fpath not in self.files:
                        continue
                    target_fd = self.files[fpath]
                    target_name = member if member else imp_name

                    if target_name in target_fd.dict_literals:
                        dict_data = target_fd.dict_literals[target_name]
                        if not isinstance(dict_data, dict) or len(dict_data) <= 1:
                            continue

                        # Found the imported dict - expand factory routers
                        del fd.routers[factory_key]

                        for i, (entry_key, entry_val) in enumerate(dict_data.items()):
                            # Build prefix from entry's category and name fields
                            prefix = ""
                            if isinstance(entry_val, dict):
                                category = entry_val.get('category', '')
                                name = entry_val.get('name', '')
                                if category and name:
                                    prefix = f"/{category.lower()}/{name.lower()}"

                            unique_var = f"{base_name}__factory_{i}"
                            rdef = RouterDef(unique_var, prefix, factory_rdef.model_name, factory_rdef.parent_var)
                            # Copy schema registrations
                            rdef.list_schema = factory_rdef.list_schema
                            rdef.retrieve_schema = factory_rdef.retrieve_schema
                            rdef.create_schema = factory_rdef.create_schema
                            rdef.update_schema = factory_rdef.update_schema
                            rdef.delete_schema = factory_rdef.delete_schema
                            fd.routers[unique_var] = rdef
                        break  # Found the dict, done expanding

    def _generate_implicit_crud_routes(self):
        """Generate CRUD routes for CrudAPIRouters that have registered schemas but no corresponding routes."""
        SCHEMA_ROUTE_MAP = {
            'list_schema': ('GET', '/'),
            'retrieve_schema': ('GET', '/{pk}'),
            'create_schema': ('POST', '/'),
            'update_schema': ('PUT', '/{pk}'),
            'delete_schema': ('DELETE', '/{pk}'),
        }

        seen_rdef_ids = set()
        for fd in self.files.values():
            for rdef in fd.routers.values():
                if id(rdef) in seen_rdef_ids:
                    continue
                seen_rdef_ids.add(id(rdef))
                if not rdef.model_name:
                    continue  # Not a CrudAPIRouter

                existing = {(r.method, r.path) for r in rdef.routes}

                for schema_attr, (method, path) in SCHEMA_ROUTE_MAP.items():
                    schema_val = getattr(rdef, schema_attr, None)
                    if schema_val and (method, path) not in existing:
                        route = RouteDef(path, method, rdef.var_name, 0, fd.file_path)
                        if schema_attr in ('list_schema', 'retrieve_schema'):
                            route.response_model_name = schema_val
                        elif schema_attr == 'create_schema':
                            route.request_model_name = schema_val
                            route.response_model_name = rdef.retrieve_schema
                        elif schema_attr == 'update_schema':
                            route.request_model_name = schema_val
                            route.response_model_name = rdef.retrieve_schema
                        elif schema_attr == 'delete_schema':
                            route.request_model_name = schema_val
                        rdef.routes.append(route)

    def _resolve_dict_includes(self):
        """Resolve for-loop based include_router(router) for router in dict.values() patterns."""
        for fd in self.files.values():
            for caller_var, dict_var, include_children in fd.dict_includes:
                if caller_var not in fd.routers:
                    continue

                caller_rdef = fd.routers[caller_var]

                # Resolve dict_var: check local dict_router_keys first, then imports
                router_keys = fd.dict_router_keys.get(dict_var)

                if not router_keys and dict_var in fd.imports:
                    # Resolve cross-file import
                    imp = fd.imports[dict_var]
                    fpath, member = self.import_resolver.resolve_module(imp, fd.file_path)
                    if fpath and fpath in self.files:
                        target_fd = self.files[fpath]
                        target_name = member if member else dict_var
                        router_keys = target_fd.dict_router_keys.get(target_name)

                if router_keys:
                    for rkey in router_keys:
                        # Find which file owns this router and copy it to the including file
                        for src_fd in self.files.values():
                            if rkey in src_fd.routers:
                                if include_children:
                                    src_fd.routers[rkey].includes_children = True
                                    self.global_includes_children.add(rkey)
                                # Copy RouterDef to the including file so _resolve_router_ref can find it
                                if rkey not in fd.routers:
                                    fd.routers[rkey] = src_fd.routers[rkey]
                                caller_rdef.includes.append(IncludeDef(rkey, ""))
                                break

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
        router_id = self.canonical_map.get(router_id, router_id)
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
                     child_router = self.files[c_file].routers[c_var]
                     # Propagate includes_children recursively (include_child_router is recursive at runtime)
                     child_router.includes_children = True
                     child_prefix = f"/{{p{level+1}_pk}}"
                     new_prefix = (current_prefix.rstrip('/') + child_prefix).rstrip('/')
                     self._resolve_router(self.files[c_file], child_router, new_prefix, visited, level + 1)

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
            result = f"{fd.file_path}:{var_name}"
            return self.canonical_map.get(result, result)

        if var_name in fd.imports:
            imp = fd.imports[var_name]
            fpath, member = self.import_resolver.resolve_module(imp, fd.file_path)
            if fpath:
                target_name = member if member else imp.split('.')[-1]
                result = f"{fpath}:{target_name}"
                return self.canonical_map.get(result, result)
        result = f"{fd.file_path}:{var_name}"
        return self.canonical_map.get(result, result)
        
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

from .deps import generate_dependency_graph

def main():
    p = argparse.ArgumentParser()
    p.add_argument("path")
    p.add_argument("--deps", action="store_true", help="Output dependency graph instead of endpoints")
    args = p.parse_args()
    
    scanner = ProjectScanner(args.path)
    scanner.scan(deps_only=args.deps)
    
    if args.deps:
        graph = generate_dependency_graph(scanner.files, scanner.import_resolver, scanner.errors)
        print(json.dumps(graph, indent=2))
        return

    scanner.resolve()
    print(json.dumps([r.to_dict() for r in scanner.endpoints], indent=2))

if __name__ == "__main__":
    main()
