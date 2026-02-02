from abc import ABC, abstractmethod
import ast
from typing import Optional, Tuple, Dict, Any

class BaseAdapter(ABC):
    def __init__(self, constants: Dict[str, str]):
        self.constants = constants

    @abstractmethod
    def parse_decorator(self, decorator: ast.Call, func_node: ast.FunctionDef) -> Optional[Tuple[str, str, Optional[str]]]:
        """
        Return (method, path, response_model_arg_name) if this decorator is a route definition.
        """
        pass

    @abstractmethod
    def parse_router_init(self, node: ast.Call) -> Optional[Tuple[str, Optional[str], Optional[str]]]:
        """
        Return (prefix, parent_router_var, model_class_name) for router initialization.
        """
        pass

    def is_include_child_router(self, node: ast.Call) -> bool:
        return False

    def _get_func_name(self, node):
        if isinstance(node, ast.Name): return node.id
        if isinstance(node, ast.Attribute): return f"{self._get_func_name(node.value)}.{node.attr}"
        return ""

    def _extract_kwarg(self, node, name, default):
        for k in node.keywords:
            if k.arg == name: return k.value
        return default

    def _extract_str(self, node):
        if isinstance(node, (ast.Constant, ast.Str)): return str(node.value)
        if isinstance(node, ast.Name): return self.constants.get(node.id, node.id)
        if isinstance(node, ast.JoinedStr):
            res = ""
            for v in node.values:
                if isinstance(v, (ast.Constant, ast.Str)): res += str(v.value)
                elif isinstance(v, ast.FormattedValue):
                     if isinstance(v.value, ast.Name):
                         res += self.constants.get(v.value.id, "{}")
                     else:
                         res += "{}"
            return res
        return ""
