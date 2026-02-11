"use client";

import { useEffect, useMemo, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";

import { type EditorLanguageKind, languageForPath } from "./editorLanguage";

function languageExtension(kind: EditorLanguageKind) {
  switch (kind) {
    case "ts":
      return javascript({ typescript: true, jsx: true });
    case "js":
      return javascript({ typescript: false, jsx: true });
    case "json":
      return json();
    case "py":
      return python();
    case "md":
      return markdown();
    case "html":
      return html();
    case "css":
      return css();
    case "text":
    default:
      return [];
  }
}

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--cm-keyword)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--cm-string)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--cm-number)" },
  { tag: [tags.comment], color: "var(--cm-comment)" },
  { tag: [tags.operator, tags.punctuation], color: "var(--cm-operator)" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--cm-function)" },
  { tag: [tags.variableName, tags.propertyName], color: "var(--cm-variable)" },
  { tag: [tags.typeName, tags.className], color: "var(--cm-type)" },
]);

const theme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "var(--cm-bg)",
      color: "var(--cm-fg)",
      fontFamily: "var(--font-mono)",
      fontSize: "13px",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "var(--font-mono)",
    },
    ".cm-content": {
      padding: "14px 16px",
      caretColor: "var(--cm-cursor)",
    },
    ".cm-line": {
      padding: 0,
    },
    ".cm-gutters": {
      backgroundColor: "var(--cm-gutter-bg)",
      color: "var(--cm-gutter-fg)",
      borderRight: "1px solid var(--cm-border)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--cm-active-line-bg)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--cm-active-line-bg)",
    },
    ".cm-selectionBackground": {
      backgroundColor: "var(--cm-selection) !important",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "var(--cm-cursor)",
    },
    "&.cm-focused": {
      outline: "none",
    },
  },
  { dark: false }
);

export function CodeEditor({
  path,
  value,
  disabled,
  onChange,
  onSave,
}: {
  path: string | null;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSave?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const configCompartmentRef = useRef(new Compartment());
  const languageCompartmentRef = useRef(new Compartment());

  const languageKind = useMemo(() => languageForPath(path), [path]);

  const baseExtensions = useMemo(
    () => [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      EditorView.lineWrapping,
      keymap.of([indentWithTab, ...defaultKeymap]),
      syntaxHighlighting(highlightStyle),
      theme,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        onChange(update.state.doc.toString());
      }),
      configCompartmentRef.current.of([]),
      languageCompartmentRef.current.of([]),
    ],
    [onChange]
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (viewRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: baseExtensions,
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [baseExtensions, value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const configExtensions = [
      EditorState.readOnly.of(disabled),
      EditorView.editable.of(!disabled),
      onSave
        ? keymap.of([
            {
              key: "Mod-s",
              run: () => {
                onSave();
                return true;
              },
            },
          ])
        : [],
    ];

    view.dispatch({
      effects: configCompartmentRef.current.reconfigure(configExtensions),
    });
  }, [disabled, onSave]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: languageCompartmentRef.current.reconfigure(languageExtension(languageKind)),
    });
  }, [languageKind]);

  return <div className="live-chat__editor-cm" ref={hostRef} />;
}
