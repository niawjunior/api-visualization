import ast
from typing import Optional, Tuple
from .base import BaseAdapter

class CustomAdapter(BaseAdapter):
    def parse_decorator(self, decorator: ast.Call, func_node: ast.FunctionDef) -> Optional[Tuple[str, str, Optional[str]]]:
        fname = self._get_func_name(decorator.func)
        parts = fname.split('.')
        method_name = parts[-1]
        
        # 1. Register Action pattern (register_create_schema, etc) -> These define routes implicitly in usage, BUT usually these are just schema setup.
        # However, the previous code treated 'register_' as route triggers if it had specific naming like list, retrieve.
        # Actually, in CrudAPIRouter, register_list_schema DOESN'T make a route on the decorator itself, it modifies the router.
        # BUT the previous code had logic for `elif m_str.startswith('register_'):`. 
        # Wait, `register_list_schema` returns a decorator that can be applied to a function to override the default implementation.
        # So yes, if used as `@router.register_list_schema(Schema)`, the decorated function BECOMES the endpoint.
        
        if method_name.startswith('register_'):
            method, path = None, None
            resp_arg = None
            if 'create' in method_name: method, path = 'POST', "/"
            elif 'update' in method_name: method, path = 'PUT', "/{id}"
            elif 'delete' in method_name: method, path = 'DELETE', "/{id}"
            elif 'list' in method_name: method, path = 'GET', "/"
            elif 'retrieve' in method_name: method, path = 'GET', "/{id}"
            
            if method:
                # Arg handling varies
                return method, path, None

        # 2. Custom Actions (list_action, get_action, etc)
        if method_name in ['list_action', 'get_action', 'post_action', 'put_action']:
            if 'list' in method_name: method, path = 'GET', f"/{func_node.name}"
            elif 'get' in method_name: method, path = 'GET', f"/{{pk}}/{func_node.name}"
            elif 'post' in method_name: method, path = 'POST', f"/{func_node.name}"
            elif 'put' in method_name: method, path = 'PUT', f"/{{pk}}/{func_node.name}"
            return method, path, "read_schema"

        # 3. Generic Action
        if 'action' in method_name:
             if 'put' in method_name: method = 'PUT'
             elif 'post' in method_name: method = 'POST'
             else: method = 'GET'
             path = f"/{func_node.name}"
             return method, path, "read_schema"

        return None

    def parse_router_init(self, node: ast.Call) -> Optional[Tuple[str, Optional[str], Optional[str]]]:
        fname = self._get_func_name(node.func)
        if fname.endswith("CrudAPIRouter"):
            prefix = self._extract_kwarg(node, "prefix", "")
            prefix = str(self._extract_str(prefix)) if prefix else ""
            
            parent = self._extract_kwarg(node, "parent_router", None)
            parent_var = self._get_func_name(parent) if parent else None
            
            model_name = None
            if node.args and isinstance(node.args[0], ast.Name):
                model_name = node.args[0].id
                
            return prefix, parent_var, model_name
        return None




    def is_include_child_router(self, node: ast.Call) -> bool:
        fname = self._get_func_name(node.func)
        return fname.endswith("include_child_router")
