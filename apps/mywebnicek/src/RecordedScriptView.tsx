import { Card, CardHeader, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text } from "@fluentui/react-components";
import { type RecordedAction } from "@mydenicek/core";

export const RecordedScriptView = ({ script }: { script: RecordedAction[] }) => {
    if (!script || script.length === 0) {
        return (
            <Card>
                <CardHeader header={<Text>Recorded Script</Text>} />
                <Text style={{ padding: 12, fontStyle: 'italic', color: '#666' }}>
                    No actions recorded yet. Perform actions on the document to record them.
                </Text>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader header={<Text>Recorded Script</Text>} />
            <Table size="small">
                <TableHeader>
                    <TableRow>
                        <TableHeaderCell>Action</TableHeaderCell>
                        <TableHeaderCell>Details</TableHeaderCell>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {script.map((action, i) => (
                        <TableRow key={i}>
                            <TableCell>{action.type}</TableCell>
                            <TableCell>
                                {action.type === "addChild" && `Add ${action.nodeType} "${action.content}" to ${action.parent} -> ${action.newIdVar}`}
                                {action.type === "setValue" && `Set ${action.target} to "${action.value}"`}
                                {action.type === "wrap" && `Wrap ${action.target} in <${action.wrapperTag}>`}
                                {action.type === "rename" && `Rename ${action.target} to <${action.newTag}>`}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Card>
    );
};
