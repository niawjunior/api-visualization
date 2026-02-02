
from typing import Dict, List, Any
from .core.models import FileData
from .core.resolver import ImportResolver

def generate_dependency_graph(file_map: Dict[str, FileData], resolver: ImportResolver) -> Dict[str, Any]:
    nodes = []
    edges = []
    added_nodes = set()
    node_id_map = {} # path -> id

    # Helper to add node
    def add_node(path_str: str, is_external: bool = False):
        if path_str in added_nodes: return
        added_nodes.add(path_str)
        
        label = path_str.split('/')[-1] if '/' in path_str else path_str
        
        nodes.append({
            "id": path_str,
            "label": label,
            "type": "external" if is_external else "file",
            "isExternal": is_external
        })
    
    # Add all scanned files as nodes first
    for rel_path, fd in file_map.items():
        # Ideally we want absolute paths for ID to match frontend expectations?
        # The frontend uses absolute paths usually.
        # But FileData stores rel_path in keys, and absolute path in fd.file_path (as string of Path object)
        # Let's use the full path from FileData
        
        full_path = str(fd.file_path) # It's a string in FileData based on my read of previous files, or Path?
        # In __main__.py: fd = FileData(rel_path), but fd.file_path isn't explicitly set to absolute there?
        # actually __main__.py:46 fd = FileData(rel_path). Wait.
        # scanner/core/models.py:37 self.file_path = file_path
        # So fd.file_path is RELATIVE! 
        # But the frontend usually expects Absolute Paths for "Deps" logic in `core.ts`.
        # `analyzeDependencies` in `core.ts` works with absolute paths.
        # We should convert to absolute paths here.
        
        abs_path = str(resolver.root / rel_path)
        add_node(abs_path, is_external=False)
        node_id_map[rel_path] = abs_path

    # Build edges
    for rel_path, fd in file_map.items():
        source_node = node_id_map.get(rel_path)
        if not source_node: continue

        for alias, imp_str in fd.imports.items():
            # Resolve import
            # We use the rel_path as "current_file" context for resolver if resolver expects it?
            # resolver.resolve_module(module_str, current_file)
            # resolver implementation:
            # resolve_module(module_str, current_file) -> tries to split module_str
            # It expects `current_file` to be a path useful for relative resolution? 
            # Actually `ImportResolver` in `resolver.py` (read earlier) doesn't seem to use `current_file` for relative logic in the snippet I saw?
            # Wait, I read `resolver.py` step 1263.
            # It DOES NOT implement relative import logic (dots). It only splits `module_str`.
            # That's a limitation of the current resolver!
            # BUT `FileData` from `ASTVisitor` has imports. `ASTVisitor` logic wasn't fully inspected for how it stores imports.
            # If `ASTVisitor` resolves '.' to absolute string before storing, good.
            # If not, we might be missing relative imports in `fd.imports`.
            
            # Let's assume `fd.imports` contains raw strings like "app.models".
            
            target_file, _ = resolver.resolve_module(imp_str, rel_path)
            
            if target_file:
                # Target is a relative path in our file_map keys (e.g "app/models/user.py")
                target_abs = str(resolver.root / target_file)
                add_node(target_abs, is_external=False)
                
                edges.append({
                    "source": source_node,
                    "target": target_abs
                })
            else:
                # External dependency? (e.g. "sqlalchemy")
                # If we want to show it:
                # add_node(imp_str, is_external=True)
                # edges.append({ "source": source_node, "target": imp_str })
                pass
                
    # Auto-Aggregation: If too many nodes, group by folder
    if len(nodes) > 30:
        return aggregate_by_folder(nodes, edges)

    return {
        "nodes": nodes,
        "edges": edges
    }

def aggregate_by_folder(nodes: List[Dict], edges: List[Dict]) -> Dict[str, Any]:
    folder_nodes = {}
    folder_edges = set()
    
    # Map file ID to folder ID
    file_to_folder = {}
    
    for n in nodes:
        if n["type"] == "external":
            # Keep external nodes as is, or group them? 
            # Let's keep them as "External Dependencies" group? 
            # Or just keep them as nodes.
            file_to_folder[n["id"]] = n["id"]
            if n["id"] not in folder_nodes:
                folder_nodes[n["id"]] = n
        else:
            # It's a file path
            # /Users/.../app/api/router.py -> /Users/.../app/api
            parent_dir = "/".join(n["id"].split('/')[:-1])
            file_to_folder[n["id"]] = parent_dir
            
            if parent_dir not in folder_nodes:
                folder_nodes[parent_dir] = {
                    "id": parent_dir,
                    "label": parent_dir.split('/')[-1],
                    "type": "folder", # Use folder type so frontend renders folder icon
                    "isExternal": False
                }

    for e in edges:
        source_folder = file_to_folder.get(e["source"])
        target_folder = file_to_folder.get(e["target"])
        
        if source_folder and target_folder and source_folder != target_folder:
            # Avoid duplicate edges
            edge_id = f"{source_folder}->{target_folder}"
            if edge_id not in folder_edges:
                folder_edges.add(edge_id)

    final_edges = []
    for edge_str in folder_edges:
        src, dst = edge_str.split("->")
        final_edges.append({
            "source": src,
            "target": dst
        })
        
    return {
        "nodes": list(folder_nodes.values()),
        "edges": final_edges
    }
