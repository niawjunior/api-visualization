from typing import List, Dict, Optional, Any, Set

class SchemaField:
    def __init__(self, name: str, type_name: str, required: bool):
        self.name = name; self.type_name = type_name; self.required = required
    def to_dict(self): return {"name": self.name, "type": self.type_name, "required": self.required}

class RouteDef:
    def __init__(self, path: str, method: str, router_var: str, lineno: int, file_path: str, function_name: str = None):
        self.path = path; self.method = method; self.router_var = router_var
        self.lineno = lineno; self.file_path = file_path; self.full_path = ""
        self.function_name = function_name
        self.dependencies = {"services": [], "database": [], "external": [], "utilities": [], "tables": [], "apiCalls": []}
        self.request_schema: List[SchemaField] = []; self.response_schema: List[SchemaField] = []
        self.request_model_name: Optional[str] = None; self.response_model_name: Optional[str] = None

    def to_dict(self):
        return {
            "path": self.path, "method": self.method, "router_var": self.router_var,
            "lineno": self.lineno, "file_path": self.file_path, "full_path": self.full_path or self.path,
            "function_name": self.function_name,
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
