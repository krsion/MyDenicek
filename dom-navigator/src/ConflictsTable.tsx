import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@fluentui/react-components";

import type { Conflict, JsonDoc } from "./Document";

export const ConflictsTable = ({ conflicts, doc }: { conflicts: Conflict[], doc: JsonDoc }) => {
    return <Table aria-label="Conflicts table">
        <TableHeader>
            <TableRow>
                <TableHeaderCell>Child</TableHeaderCell>
                <TableHeaderCell>Parent node</TableHeaderCell>
                <TableHeaderCell>Replica</TableHeaderCell>
            </TableRow>
        </TableHeader>

        <TableBody>
            {conflicts.flatMap((c) => c.parents.map((pp, idx) => (
                <TableRow key={`${c.child}-${idx}`}>
                    {idx === 0 && (
                        <TableCell rowSpan={c.parents.length}>
                            {c.child}
                        </TableCell>
                    )}

                    <TableCell>
                        {pp.parent === null ? "(root)" : doc.nodes.find((n) => n.id == pp.parent)?.tag ?? pp.parent}
                    </TableCell>

                    <TableCell>
                        {pp.peerId ? pp.peerId : "unknown"}
                    </TableCell>
                </TableRow>
            ))
            )}
        </TableBody>
    </Table>;
}
