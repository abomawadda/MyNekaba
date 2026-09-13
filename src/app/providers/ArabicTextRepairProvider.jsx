import { useEffect } from "react";
import { isLikelyArabicMojibake, repairArabicMojibake } from "../../utils/arabicMojibake";

const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE"]);

const shouldSkipNode = (node) => {
  if (!node?.parentElement) return true;
  return SKIPPED_TAGS.has(node.parentElement.tagName);
};

const repairTextNode = (node) => {
  if (!node || shouldSkipNode(node)) return;
  const rawText = node.nodeValue || "";
  if (!isLikelyArabicMojibake(rawText)) return;

  const repaired = repairArabicMojibake(rawText);
  if (repaired && repaired !== rawText) {
    node.nodeValue = repaired;
  }
};

const repairTree = (root) => {
  if (!root || !(root instanceof Node)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    repairTextNode(current);
    current = walker.nextNode();
  }
};

export default function ArabicTextRepairProvider({ children }) {
  useEffect(() => {
    repairTree(document.body);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
          repairTextNode(mutation.target);
          return;
        }

        mutation.addedNodes.forEach((addedNode) => {
          if (addedNode.nodeType === Node.TEXT_NODE) {
            repairTextNode(addedNode);
            return;
          }
          repairTree(addedNode);
        });
      });
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return children;
}

