import { DENICEK_TOOLS, serializeDocument } from '@mydenicek/mcp';
import { type DenicekActions, type DenicekModel } from '@mydenicek/react';
import { useState } from 'react';

export type { DenicekActions };

// Define the tools available to the LLM
const tools = DENICEK_TOOLS;

interface Message {
  role: string;
  content: string | null;
  tool_calls?: unknown[] | undefined;
}

export function useLlmController(
  model: DenicekModel,
  actions: DenicekActions,
  apiKey: string
) {
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const sendMessage = async (userMessage: string) => {
    if (!apiKey) {
      alert("Please provide an API Key (OpenAI 'sk-...' or Anthropic 'sk-ant-...')");
      return;
    }

    setIsLoading(true);
    const docXml = serializeDocument(model.getSnapshot());
    
    const systemPrompt = `You are an assistant that helps edit a structured document. 
The document is represented as a tree of nodes. There are two types of nodes:
1. Element Nodes: These have a tag name (e.g., "div", "p", "ul") and can contain child nodes.
2. Value Nodes: These contain text content. In the XML representation, they appear as <value id="...">text content</value>.

Here is the current state of the document in a simplified XML format:

${docXml}

You have access to tools to modify this document. 
When the user asks for a change, analyze the document structure, find the relevant IDs, and call the appropriate tools.
Always use the IDs provided in the XML.

Common operations:
- To add text inside an element: Use 'addChildren' with type="value" and content="your text".
- To add a new element (e.g., a list item): Use 'addChildren' with type="element" and content="li".
- To add a new element AND text inside it in one go:
  1. Call 'addChildren' with type="element", content="li", and temporaryId="temp-1".
  2. Call 'addChildren' with parentIds=["temp-1"], type="value", and content="Item Text".
- To change text: Use 'updateValue' on the specific value node ID (not the parent element ID).
- To wrap items (e.g., in a bold tag): Use 'wrapNodes' with wrapperTag="b".
`;

    const newMessages = [
      ...messages,
      { role: "user", content: userMessage }
    ];

    try {
      if (apiKey.startsWith("sk-ant")) {
        // Anthropic API
        const anthropicTools = tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters
        }));

        // Filter out system messages from history for Anthropic (passed separately)
        const anthropicMessages = newMessages.filter(m => m.role !== "system").map(m => ({
          role: m.role,
          content: m.content
        }));

        const response = await fetch("/api/anthropic/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: systemPrompt,
            messages: anthropicMessages,
            tools: anthropicTools,
          })
        });

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error.message);
        }

        const content = data.content as { type: string; text?: string; name?: string; input?: unknown }[];
        const textContent = content.find((c) => c.type === "text")?.text || "";
        const toolUses = content.filter((c) => c.type === "tool_use");

        // Add assistant response to history
        setMessages(prev => [...prev, { 
          role: "user", 
          content: userMessage,
          tool_calls: undefined
        }, { 
          role: "assistant", 
          content: textContent,
          tool_calls: toolUses.length > 0 ? toolUses as unknown[] : undefined
        }]);

        const idMap = new Map<string, string>();
        for (const toolUse of toolUses) {
          const functionName = toolUse.name;
          const args = toolUse.input as Record<string, unknown>;

          console.log(`Executing ${functionName}`, args);
          if (functionName) {
            executeTool(functionName, args, idMap);
          }
        }

      } else {
        // OpenAI API
        const systemMessage = {
          role: "system",
          content: systemPrompt
        };

        const response = await fetch("/api/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "gpt-4o", 
            messages: [systemMessage, ...newMessages],
            tools: tools,
            tool_choice: "auto"
          })
        });

        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error.message);
        }

        const choice = data.choices[0];
        const responseMessage = choice.message;

        // Add assistant response to history
        setMessages(prev => [...prev, { role: "user", content: userMessage }, responseMessage]);

        if (responseMessage.tool_calls) {
          const idMap = new Map<string, string>();
          for (const toolCall of responseMessage.tool_calls) {
            const functionName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);

            console.log(`Executing ${functionName}`, args);
            executeTool(functionName, args, idMap);
          }
        }
      }
    } catch (error) {
      console.error("LLM Error:", error);
      alert("Failed to communicate with LLM: " + error);
    } finally {
      setIsLoading(false);
    }
  };

  const executeTool = (functionName: string, args: Record<string, unknown>, idMap: Map<string, string>) => {
    // Resolve IDs
    if (Array.isArray(args['nodeIds'])) args['nodeIds'] = args['nodeIds'].map((id: unknown) => (typeof id === 'string' ? idMap.get(id) || id : id));
    if (Array.isArray(args['parentIds'])) args['parentIds'] = args['parentIds'].map((id: unknown) => (typeof id === 'string' ? idMap.get(id) || id : id));
    if (Array.isArray(args['referenceIds'])) args['referenceIds'] = args['referenceIds'].map((id: unknown) => (typeof id === 'string' ? idMap.get(id) || id : id));

    switch (functionName) {
      case "updateAttribute":
        actions.updateAttribute(args['nodeIds'] as string[], args['key'] as string, args['value']);
        break;
      case "updateTag":
        actions.updateTag(args['nodeIds'] as string[], args['newTag'] as string);
        break;
      case "wrapNodes":
        actions.wrapNodes(args['nodeIds'] as string[], args['wrapperTag'] as string);
        break;
      case "updateValue":
        actions.updateValue(args['nodeIds'] as string[], args['newValue'] as string, args['originalValue'] as string);
        break;
      case "addChildren": {
        const newIds = actions.addChildren(args['parentIds'] as string[], args['type'] as "element" | "value", args['content'] as string);
        const tempId = args['temporaryId'];
        if (typeof tempId === 'string' && newIds.length > 0 && newIds[0]) {
          idMap.set(tempId, newIds[0]);
        }
        break;
      }
      case "deleteNodes":
        actions.deleteNodes(args['nodeIds'] as string[]);
        break;
    }
  };

  return {
    sendMessage,
    isLoading,
    messages
  };
}
