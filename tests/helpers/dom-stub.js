"use strict";

// A tiny, dependency-free DOM stand-in.
//
// The extension ships no bundler and no test dependencies, so the UI surfaces
// are exercised by loading them into a vm context against this stub. It
// implements only the surface the popup/options code actually touches:
// element creation, id lookup, children, attributes, events and focus.

function createElement(tagName, registry) {
  const listeners = {};
  const attributes = {};
  const classes = new Set();

  const el = {
    tagName: String(tagName || "div").toUpperCase(),
    className: "",
    textContent: "",
    value: "",
    checked: false,
    disabled: false,
    hidden: false,
    title: "",
    style: {},
    children: [],
    childElementCount: 0,
    classList: {
      add(...names) {
        for (const name of names) classes.add(name);
        el.className = Array.from(classes).join(" ");
      },
      remove(...names) {
        for (const name of names) classes.delete(name);
        el.className = Array.from(classes).join(" ");
      },
      contains(name) {
        return classes.has(name);
      },
      toggle(name) {
        if (classes.has(name)) classes.delete(name);
        else classes.add(name);
        el.className = Array.from(classes).join(" ");
        return classes.has(name);
      }
    },
    appendChild(child) {
      el.children.push(child);
      el.childElementCount = el.children.length;
      return child;
    },
    addEventListener(type, fn) {
      if (typeof fn !== "function") return;
      (listeners[type] = listeners[type] || []).push(fn);
    },
    removeEventListener() {},
    dispatch(type, event) {
      const handlers = listeners[type] || [];
      const payload = Object.assign({ target: el, preventDefault() {} }, event || {});
      for (const fn of handlers) fn(payload);
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    getAttributeNames() {
      return Object.keys(attributes);
    },
    focus() {
      el.focused = true;
    }
  };

  // Assigning an id registers the element so document.getElementById finds
  // elements the page created dynamically (the options checkboxes).
  let currentId = "";
  Object.defineProperty(el, "id", {
    get() {
      return currentId;
    },
    set(value) {
      currentId = value == null ? "" : String(value);
      if (registry && currentId) registry.set(currentId, el);
    },
    enumerable: true,
    configurable: true
  });

  Object.defineProperty(el, "innerHTML", {
    get() {
      return el._html || "";
    },
    set(value) {
      el._html = String(value == null ? "" : value);
      if (el._html === "") {
        el.children = [];
        el.childElementCount = 0;
      }
    },
    enumerable: true,
    configurable: true
  });

  return el;
}

function createDocument() {
  const registry = new Map();

  const doc = {
    readyState: "complete",
    listeners: {},
    createElement(tag) {
      return createElement(tag, registry);
    },
    createDocumentFragment() {
      return createElement("fragment", registry);
    },
    createTreeWalker() {
      return { nextNode: () => null };
    },
    querySelectorAll() {
      return [];
    },
    getElementById(id) {
      if (registry.has(id)) return registry.get(id);
      const el = createElement("div", registry);
      el.id = id;
      registry.set(id, el);
      return el;
    },
    addEventListener(type, fn) {
      if (typeof fn !== "function") return;
      (doc.listeners[type] = doc.listeners[type] || []).push(fn);
    },
    dispatch(type, event) {
      for (const fn of doc.listeners[type] || []) fn(event || {});
    }
  };

  doc.documentElement = createElement("html", registry);
  doc.documentElement.setAttribute("lang", "en");
  doc.body = createElement("body", registry);

  return doc;
}

// Collects the text a surface rendered, so assertions can look at what the
// user would actually see.
function textOf(node) {
  if (!node) return "";
  let out = node.textContent || "";
  for (const child of node.children || []) {
    out += " " + textOf(child);
  }
  return out.trim();
}

function findAll(node, predicate, acc = []) {
  if (!node) return acc;
  if (predicate(node)) acc.push(node);
  for (const child of node.children || []) findAll(child, predicate, acc);
  return acc;
}

module.exports = { createElement, createDocument, textOf, findAll };
