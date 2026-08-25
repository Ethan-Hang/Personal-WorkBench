import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveSettings } from '@workbench/core';
import { describe, expect, it } from 'vitest';

import { AppShell } from './AppShell.js';
import { SettingsProvider } from './SettingsContext.js';
import type { SettingsStore } from './settingsSync.js';
import { ThemeProvider } from './ThemeContext.js';

describe('AppShell brand', () => {
  it('keeps the favicon out of the sidebar brand area', () => {
    const settings = resolveSettings({});
    const store: SettingsStore = {
      readSnapshot: () => settings,
      writeSnapshot: () => undefined,
      load: async () => ({ settings, storedKeys: [] }),
      patch: async (patch) => ({ ...settings, ...patch }),
    };

    const shell = createElement(AppShell, {
      navGroups: [],
      activePath: '/today',
      children: '内容',
    });
    const themedShell = createElement(ThemeProvider, { children: shell });
    const markup = renderToStaticMarkup(
      createElement(SettingsProvider, { store, children: themedShell }),
    );

    expect(markup).toContain('个人工作台');
    expect(markup).not.toContain('src="/favicon.svg"');
  });
});
