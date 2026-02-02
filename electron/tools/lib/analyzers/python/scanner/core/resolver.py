import os
from typing import Dict, List, Optional, Tuple, Set, Any
from pathlib import Path
from .models import FileData, SchemaField

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
        if not module_str: return None, None
        
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
            
            if target_file and target_file in self.files:
                target_name = target_member or model_name # Default fallback
                # If target_member is None but import was "from mod import User", target_name should already be User logic handled by resolver
                if not target_member:
                     # Check if the module exports it directly (e.g. from x import y, imports[y] = x.y)
                     # The resolve_module logic splits x.y -> x.py, y
                     pass
                
                return self.find_model_fields(self.files[target_file], target_name, visited)

        return []
