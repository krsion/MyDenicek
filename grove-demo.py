# This is a sample representation of HTML document using the Grove Calculus. https://dl.acm.org/doi/10.1145/3704909

# Possible positions for each node type (constructor)
constructors_positions = {
    "<body>" : ["content"], 
    "<a>" : ["href", "content"], 
    "<p>" : ["content"],
    "linkedList" : ["head", "tail"],
    "attribute" : ["value"],
    "string" : [] # no positions, leaf node, the actual value is stored in the node id
}

# G = W x L             x V 
#   = W x ( V      x P) x V 
#   = W x ((U x K) x P) x (U x K)

EDGE_ID, NODE_ID_FROM, NODE_TYPE_FROM, POSITION_FROM, NODE_ID_TO, NODE_TYPE_TO, STATUS = 0, 1, 2, 3, 4, 5, 6

example = {
    ("edge0", "node0",  "<body>", "content", "node1", "linkedList", "active"),
    ("edge1", "node1", "linkedList", "head", "node2", "<a>", "active"),
    ("edge2", "node2", "<a>", "href", "node3", "attribute", "active"),
    ("edge3", "node3", "attribute", "value", "http://example.com", "string", "active"),
    ("edge7", "node2", "<a>", "content", "Click here", "string", "active"),
    ("edge4", "node1", "linkedList", "tail", "node4", "linkedList", "active"),
    ("edge5", "node4", "linkedList", "head", "node5", "<p>", "active"),
    ("edge6", "node5", "<p>", "content", "Hello, world!", "string", "active"),
}
root = "node0"

def render(edges: set, root_node: str) -> str:
    edges_from_root = [e for e in edges if e[NODE_ID_FROM] == root_node and e[STATUS] == "active"]
    if not edges_from_root:
        print(root_node, end='')
        return
    
    from_type = edges_from_root[0][NODE_TYPE_FROM]

    if from_type == "attribute":
        for edge in edges_from_root:
            _, _, _, position, to_node, to_type, _ = edge
            if to_type == "string" and position == "value":
                print(to_node, end='')

    if from_type.startswith("<") and from_type.endswith(">"):
        print(from_type[:-1], end="")
        attributes_edges = [e for e in edges_from_root if e[NODE_TYPE_TO] == "attribute"]
        for attr_edge in attributes_edges:
            print(f' {attr_edge[POSITION_FROM]}="', end='')
            render(edges, attr_edge[NODE_ID_TO])
            print('"', end="")
        print(">", end="")
        content_edges = [e for e in edges_from_root if e[POSITION_FROM] == "content"]
        for content_edge in content_edges:
            render(edges, content_edge[NODE_ID_TO])
        print(f"</{from_type[1:-1]}>", end="")
    
    if from_type == "linkedList":
        head_edges = [e for e in edges_from_root if e[POSITION_FROM] == "head"]
        for head_edge in head_edges:
            render(edges, head_edge[NODE_ID_TO])
        tail_edges = [e for e in edges_from_root if e[POSITION_FROM] == "tail"]
        for tail_edge in tail_edges:
            render(edges, tail_edge[NODE_ID_TO])

# prints <body><a href="http://example.com">Click here</a><p>Hello, world!</p></body>
render(example, root)
