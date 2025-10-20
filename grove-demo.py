# This is a sample representation of HTML document using the Grove Calculus. https://dl.acm.org/doi/10.1145/3704909

# Possible positions for each node type (constructor)
constructors_positions = {
    "<body>" : ["firstChild", "nextElement"], 
    "<a>" : ["attr_href", "firstChild", "nextElement"], 
    "<p>" : ["firstChild", "nextElement"],
    "string(*)" : ["nextElement"] # string can have nextElement. example: <p>Hello<strong>WORLD!</strong>></p>
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
    ("edge4", "node4", "<p>", "firstChild", "node5", 'string("Hello, ")', "active"),
    ("edge5", "node5", 'string("Hello, ")', "nextElement", "node6", "<strong>", "active"),
    ("edge6", "node6", "<strong>", "firstChild", "node7", 'string("world!")', "active"),
}
root = "node0"
root_type = "<body>"

def render(edges: set, root_node_id: str, root_node_type: str) -> str:
    is_string_node = root_node_type.startswith('string("') and root_node_type.endswith('")')
    is_element_node = root_node_type.startswith("<") and root_node_type.endswith(">")

    edges_from_root = [e for e in edges if e[NODE_ID_FROM] == root_node_id and e[STATUS] == "active"]

    if is_string_node:
        print(root_node_type[8:-2], end='')
    
    if is_element_node:
        print(root_node_type[:-1], end="")
        attributes_edges = [e for e in edges_from_root if e[POSITION_FROM].startswith("attr_")]
        for attr_edge in attributes_edges:
            print(f' {attr_edge[POSITION_FROM][5:]}="', end='')
            render(edges, attr_edge[NODE_ID_TO], attr_edge[NODE_TYPE_TO])
            print('"', end="")
        print(">", end="")

        firstChild_edges = [e for e in edges_from_root if e[POSITION_FROM] == "firstChild"]
        for firstChild_edge in firstChild_edges:
            render(edges, firstChild_edge[NODE_ID_TO], firstChild_edge[NODE_TYPE_TO])
        print(f"</{root_node_type[1:-1]}>", end="")
    
    if is_string_node or is_element_node:
        nextElement_edges = [e for e in edges_from_root if e[POSITION_FROM] == "nextElement"]
        for nextElement_edge in nextElement_edges:
            render(edges, nextElement_edge[NODE_ID_TO], nextElement_edge[NODE_TYPE_TO])


def next_node_id(edges):
    nodes = [e[NODE_ID_TO] for e in edges] + [e[NODE_ID_FROM] for e in edges]
    max_node = max(nodes)
    return f"node{int(max_node[4:]) + 1}"

def next_edge_id(edges):
    return f"edge{len(edges)}"

def add(edges, from_node_id, from_node_type, from_position, to_node_type):
    new_edge_id, new_node_id = next_edge_id(edges), next_node_id(edges)
    edges.add((new_edge_id, from_node_id, from_node_type, from_position, new_node_id, to_node_type, "active"))


# specific examples what we can add. probably will be separate buttons for each in the real UI

def add_firstChild(edges, from_node_id, from_node_type, to_node_type):
    add(edges, from_node_id, from_node_type, "firstChild", to_node_type)

def add_nextElement(edges, from_node_id, from_node_type, to_node_type):
    add(edges, from_node_id, from_node_type, "nextElement", to_node_type)

def add_string(edges, from_node_id, from_node_type, from_position, string_value):
    add(edges, from_node_id, from_node_type, from_position, f'string("{string_value}")')

def add_href(edges, from_node_id, href_value):
    add_string(edges, from_node_id, "<a>", "attr_href", href_value)


# prints <body><a href="http://example.com">Click here</a><p>Hello, world!</p></body>
render(example, root, root_type)
