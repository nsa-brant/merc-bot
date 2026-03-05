#!/usr/bin/env bun
/**
 * merc — Mercury 2 coding agent CLI
 * Usage: merc [prompt]
 *   Interactive mode: just run `merc`
 *   One-shot mode:    merc "explain diffusion models"
 */

import React, { useState } from "react";
import { render, Box } from "ink";
import { loadConfig, getDefaultModel } from "./src/lib/config.ts";
import { createClient } from "./src/lib/api.ts";
import App from "./src/app.tsx";
import OneShot from "./src/one-shot.tsx";
import ApiKeySetup from "./src/components/ApiKeySetup.tsx";
import type OpenAI from "openai";

const args = process.argv.slice(2);
const defaultModel = getDefaultModel();

function Root() {
  // Check for API key from env or config
  const envKey = process.env.INCEPTION_API_KEY;
  const configKey = loadConfig()?.api_key;
  const initialKey = envKey || configKey || null;

  const [apiKey, setApiKey] = useState<string | null>(initialKey);
  const [client, setClient] = useState<OpenAI | null>(null);

  // Create client once we have a key
  React.useEffect(() => {
    if (apiKey && !client) {
      createClient(apiKey).then(setClient);
    }
  }, [apiKey, client]);

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
    return <OneShot client={client} defaultModel={defaultModel} prompt={prompt} />;
  }

  return <App client={client} defaultModel={defaultModel} />;
}

render(<Root />);
