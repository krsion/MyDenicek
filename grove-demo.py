# This is a sample representation of HTML document using the Grove Calculus. https://dl.acm.org/doi/10.1145/3704909

# Possible positions for each node type (constructor)
constructors_positions = {
    "<body>" : ["firstChild", "nextElement"], 
    "<a>" : ["attr_href", "firstChild", "nextElement"], 
    "<p>" : ["firstChild", "nextElement"],
    "string(*)" : [] # no positions, leaf node, the actual value is stored in the node id
}

# G = W x L             x V 
#   = W x ( V      x P) x V 
#   = W x ((U x K) x P) x (U x K)

EDGE_ID, NODE_ID_FROM, NODE_TYPE_FROM, POSITION_FROM, NODE_ID_TO, NODE_TYPE_TO, STATUS = 0, 1, 2, 3, 4, 5, 6

example = {
    ("edge0", "node0", "<body>", "firstChild", "node1", "<a>", "active"),
    ("edge1", "node1", "<a>", "attr_href", "node2", 'string("http://example.com")', "active"),
    ("edge2", "node1", "<a>", "firstChild", "node3", 'string("Click here")', "active"),
    ("edge3", "node1", "<a>", "nextElement", "node4", "<p>", "active"),
    ("edge4", "node4", "<p>", "firstChild", "node5", 'string("Hello, world!")', "active"),
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
        attributes_edges = [e for e in edges_from_root if e[POSITION_FROM].startswith("attr_")]
        for attr_edge in attributes_edges:
            print(f' {attr_edge[POSITION_FROM][5:]}="', end='')
            render(edges, attr_edge[NODE_ID_TO], attr_edge[NODE_TYPE_TO])
            print('"', end="")
        print(">", end="")

        firstChild_edges = [e for e in edges_from_root if e[POSITION_FROM] == "firstChild"]
        for firstChild_edge in firstChild_edges:
            render(edges, firstChild_edge[NODE_ID_TO], firstChild_edge[NODE_TYPE_TO])
        print(f"</{from_type[1:-1]}>", end="")

        nextElement_edges = [e for e in edges_from_root if e[POSITION_FROM] == "nextElement"]
        for nextElement_edge in nextElement_edges:
            render(edges, nextElement_edge[NODE_ID_TO], nextElement_edge[NODE_TYPE_TO])


# prints <body><a href="http://example.com">Click here</a><p>Hello, world!</p></body>
render(example, root, root_type)
