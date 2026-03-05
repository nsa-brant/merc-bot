#!/usr/bin/env bun

/**
 * merc — Mercury 2 coding agent CLI
 * Usage: merc [prompt]
 *   Interactive mode: just run `merc`
 *   One-shot mode:    merc "explain diffusion models"
 */

import { render } from "ink";
import type OpenAI from "openai";
import React, { useState } from "react";
import App from "./src/app.tsx";
import ApiKeySetup from "./src/components/ApiKeySetup.tsx";
import { createClient } from "./src/lib/api.ts";
import { getDefaultModel, loadConfig } from "./src/lib/config.ts";
import { connectMcpServers, disconnectMcpServers } from "./src/lib/mcp.ts";
import OneShot from "./src/one-shot.tsx";

const rawArgs = process.argv.slice(2);
const cookFlag = rawArgs.includes("--cook");
const args = rawArgs.filter((a) => a !== "--cook");
const defaultModel = getDefaultModel();

function Root() {
  // Check for API key from env or config
  const envKey = process.env.INCEPTION_API_KEY;
  const configKey = loadConfig()?.api_key;
  const initialKey = envKey || configKey || null;

  const [apiKey, setApiKey] = useState<string | null>(initialKey);
  const [client, setClient] = useState<OpenAI | null>(null);

  // Create client (fast)
  React.useEffect(() => {
    if (apiKey && !client) {
      createClient(apiKey).then(setClient);
    }
  }, [apiKey, client]);

  // Connect MCP servers in background (don't block app startup)
  React.useEffect(() => {
    const config = loadConfig();
    const mcpConfigs = config?.mcpServers ?? {};
    if (Object.keys(mcpConfigs).length > 0) {
      connectMcpServers(mcpConfigs).catch((err: Error) => {
        process.stderr.write(`[mcp] Startup connection failed: ${err.message}\n`);
      });
    }
  }, []);

  // Disconnect MCP servers on exit
  React.useEffect(() => {
    return () => {
      disconnectMcpServers();
    };
  }, []);

  // Show setup if no key
  if (!apiKey) {
    return (
      <ApiKeySetup
        onKeySet={(key) => {
          setApiKey(key);
        }}
      />
    );
  }

  // Wait for client to be created
  if (!client) return null;

  if (args.length > 0) {
    const prompt = args.join(" ");
    return (
      <OneShot client={client} defaultModel={defaultModel} prompt={prompt} cookMode={cookFlag} />
    );
  }

  return <App client={client} defaultModel={defaultModel} initialCookMode={cookFlag} />;
}

render(<Root />);
