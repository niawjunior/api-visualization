import ast
from typing import Optional, Tuple
from .base import BaseAdapter

class FastAPIAdapter(BaseAdapter):
    def parse_decorator(self, decorator: ast.Call, func_node: ast.FunctionDef) -> Optional[Tuple[str, str, Optional[str]]]:
        fname = self._get_func_name(decorator.func)
        parts = fname.split('.')
        method_name = parts[-1]
        
        if method_name in ['get', 'post', 'put', 'delete', 'patch', 'options', 'head']:
            method = method_name.upper()
            if decorator.args:
                path = self._extract_str(decorator.args[0])
            else:
                path = self._extract_kwarg(decorator, "path", "")
            return method, path, "response_model"
        
        return None

    def parse_router_init(self, node: ast.Call) -> Optional[Tuple[str, Optional[str], Optional[str]]]:
        fname = self._get_func_name(node.func)
        if fname.endswith("APIRouter"):
             prefix = self._extract_kwarg(node, "prefix", "")
             prefix = str(self._extract_str(prefix)) if prefix else ""
             return prefix, None, None
        return None
