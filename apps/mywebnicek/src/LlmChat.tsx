import { Button, Input, Spinner, Textarea } from "@fluentui/react-components";
import { SendRegular } from "@fluentui/react-icons";
import { type JsonDoc } from "@mydenicek/core";
import { useState } from "react";

import { type DenicekActions, useLlmController } from "./hooks/useLlmController";

interface LlmChatProps {
    doc: JsonDoc;
    actions: DenicekActions;
}

export const LlmChat = ({ doc, actions }: LlmChatProps) => {
    const [apiKey, setApiKey] = useState("");
    const [input, setInput] = useState("");
    const { sendMessage, isLoading, messages } = useLlmController(doc, actions, apiKey);

    const handleSend = () => {
        if (!input.trim()) return;
        sendMessage(input);
        setInput("");
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8, padding: 8 }}>
            <Input
                type="password"
                placeholder="OpenAI (sk-...) or Anthropic (sk-ant-...) Key"
                value={apiKey}
                onChange={(_, data) => setApiKey(data.value)}
            />

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #ccc', padding: 8, borderRadius: 4 }}>
                {messages.map((msg, i) => (
                    <div key={i} style={{
                        marginBottom: 8,
                        textAlign: msg.role === 'user' ? 'right' : 'left',
                        backgroundColor: msg.role === 'user' ? '#e6f7ff' : '#f0f0f0',
                        padding: 8,
                        borderRadius: 4
                    }}>
                        <strong>{msg.role === 'user' ? 'You' : 'Assistant'}:</strong>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content || (msg.tool_calls ? "Executing tools..." : "")}</div>
                    </div>
                ))}
                {isLoading && <Spinner size="tiny" />}
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
                <Textarea
                    style={{ flex: 1 }}
                    value={input}
                    onChange={(_, data) => setInput(data.value)}
                    placeholder="Ask to edit the document..."
                />
                <Button icon={<SendRegular />} onClick={handleSend} disabled={isLoading} />
            </div>
        </div>
    );
};
