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
    ("edge3", "node3", "attribute", "value", "node6", 'string("http://example.com")', "active"),
    ("edge7", "node2", "<a>", "content", "node7", 'string("Click here")', "active"),
    ("edge4", "node1", "linkedList", "tail", "node4", "linkedList", "active"),
    ("edge5", "node4", "linkedList", "head", "node5", "<p>", "active"),
    ("edge6", "node5", "<p>", "content", "node8", 'string("Hello, world!")', "active"),
}
root = "node0"
root_type = "<body>"

def render(edges: set, root_node_id: str, root_node_type: str) -> str:
    edges_from_root = [e for e in edges if e[NODE_ID_FROM] == root_node_id and e[STATUS] == "active"]
    if not edges_from_root:
        if root_node_type.startswith('string("') and root_node_type.endswith('")'):
            print(root_node_type[8:-2], end='')
        else:
            print(root_node_type, end='')
        return
    
    from_type = edges_from_root[0][NODE_TYPE_FROM]

    if from_type == "attribute":
        for edge in edges_from_root:
            if edge[NODE_TYPE_TO].startswith("string") and edge[POSITION_FROM] == "value":
                render(edges, edge[NODE_ID_TO], edge[NODE_TYPE_TO])

    if from_type.startswith("<") and from_type.endswith(">"):
        print(from_type[:-1], end="")
        attributes_edges = [e for e in edges_from_root if e[NODE_TYPE_TO] == "attribute"]
        for attr_edge in attributes_edges:
            print(f' {attr_edge[POSITION_FROM]}="', end='')
            render(edges, attr_edge[NODE_ID_TO], attr_edge[NODE_TYPE_TO])
            print('"', end="")
        print(">", end="")
        content_edges = [e for e in edges_from_root if e[POSITION_FROM] == "content"]
        for content_edge in content_edges:
            render(edges, content_edge[NODE_ID_TO], content_edge[NODE_TYPE_TO])
        print(f"</{from_type[1:-1]}>", end="")
    
    if from_type == "linkedList":
        head_edges = [e for e in edges_from_root if e[POSITION_FROM] == "head"]
        for head_edge in head_edges:
            render(edges, head_edge[NODE_ID_TO], head_edge[NODE_TYPE_TO])
        tail_edges = [e for e in edges_from_root if e[POSITION_FROM] == "tail"]
        for tail_edge in tail_edges:
            render(edges, tail_edge[NODE_ID_TO], tail_edge[NODE_TYPE_TO])

# prints <body><a href="http://example.com">Click here</a><p>Hello, world!</p></body>
render(example, root, root_type)
