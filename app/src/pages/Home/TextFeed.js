import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { Colors } from "../../styles/global";

const Table = styled.table`
  width: 100%;
  max-width: 800px;
  margin: 2em 0;
  border-collapse: collapse;
  border: 1px solid #ddd;
  table-layout: fixed;
`;

const TableRow = styled.tr`
  border-bottom: 1px solid #ddd;
`;

const TableHeader = styled.th`
  padding: 0.5em;
  text-align: left;
  color: ${Colors.lime};
`;

const TableCell = styled.td`
  padding: 0.5em;
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: 0;
`;

const KeyCell = styled(TableCell)`
  color: ${Colors.lime};
  width: 20%;
`;

const ValueCell = styled(TableCell)`
  width: 80%;
`;

const MultiLineText = styled.div`
  max-height: 6em; // Approximately 3-4 lines
  overflow-y: auto;
  white-space: pre-wrap;
`;

export function TextFeed() {
    const [lastEntry, setLastEntry] = useState(null);

    useEffect(() => {
        const eventSource = new EventSource("https://text.pollinations.ai/feed");

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            setLastEntry(data);
        };

        return () => {
            eventSource.close();
        };
    }, []);

    if (!lastEntry) {
        return <div>Loading...</div>;
    }

    const { response, parameters } = lastEntry;
    const { model, messages, seed, type } = parameters;

    const systemMessage = messages.filter(msg => msg.role === "system").pop()?.content || "No system message found";
    const userPrompt = messages.filter(msg => msg.role === "user").pop()?.content || "No user prompt found";

    return (
        <Table>
            <tbody>
                <TableRow>
                    <KeyCell>Prompt</KeyCell>
                    <ValueCell>
                        <MultiLineText>{userPrompt}</MultiLineText>
                    </ValueCell>
                </TableRow>
                <TableRow>
                    <KeyCell>Model</KeyCell>
                    <ValueCell>{model}</ValueCell>
                </TableRow>
                <TableRow>
                    <KeyCell>Response</KeyCell>
                    <ValueCell>
                        <MultiLineText>{response}</MultiLineText>
                    </ValueCell>
                </TableRow>
                <TableRow>
                    <KeyCell>System</KeyCell>
                    <ValueCell>
                        <MultiLineText>{systemMessage}</MultiLineText>
                    </ValueCell>
                </TableRow>
                <TableRow>
                    <KeyCell>Seed</KeyCell>
                    <ValueCell>{seed}</ValueCell>
                </TableRow>
                <TableRow>
                    <KeyCell>Type</KeyCell>
                    <ValueCell>{type}</ValueCell>
                </TableRow>
            </tbody>
        </Table>
    );
}