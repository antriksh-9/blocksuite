import type { UIEventStateContext } from '@blocksuite/block-std';
import { PathFinder } from '@blocksuite/block-std';
import { IS_MAC } from '@blocksuite/global/env';
import { assertExists } from '@blocksuite/global/utils';
import {
  INLINE_ROOT_ATTR,
  type InlineEditor,
  type InlineRootElement,
} from '@blocksuite/inline';
import type { BlockElement } from '@blocksuite/lit';

import { matchFlavours } from '../../../../_common/utils/model.js';
import type { PageBlockComponent } from '../../../../page-block/types.js';
import { getSelectedContentModels } from '../../../../page-block/utils/selection.js';
import { insertLinkedNode } from '../../../../page-block/widgets/linked-page/config.js';
import { textFormatConfigs } from '../../../configs/text-format/config.js';
import { createDefaultPage } from '../../../utils/init.js';
import { buildPath } from '../../../utils/query.js';
import { tryConvertBlock } from '../markdown/block.js';
import {
  handleIndent,
  handleMultiBlockIndent,
  handleMultiBlockOutdent,
  handleRemoveAllIndent,
  handleRemoveAllIndentForMultiBlocks,
  handleUnindent,
} from '../rich-text-operations.js';
import { bracketPairs } from './bracket-pairs.js';
import { hardEnter, onBackspace, onForwardDelete } from './legacy.js';

export const bindContainerHotkey = (blockElement: BlockElement) => {
  const selection = blockElement.host.selection;
  const model = blockElement.model;
  const root = blockElement.host;
  const leftBrackets = bracketPairs.map(pair => pair.left);

  const _selectBlock = () => {
    selection.update(selList => {
      return selList.map(sel => {
        if (PathFinder.equals(sel.path, blockElement.path)) {
          return selection.getInstance('block', { path: blockElement.path });
        }
        return sel;
      });
    });
    blockElement
      .querySelector<InlineRootElement>(`[${INLINE_ROOT_ATTR}]`)
      ?.blur();
    return true;
  };

  const _selectText = (start: boolean) => {
    selection.update(selList => {
      return selList.map(sel => {
        if (PathFinder.equals(sel.path, blockElement.path)) {
          return selection.getInstance('text', {
            from: {
              path: blockElement.path,
              index: start ? 0 : blockElement.model.text?.length ?? 0,
              length: 0,
            },
            to: null,
          });
        }
        return sel;
      });
    });
    return true;
  };

  const _getInlineEditor = () => {
    const inlineRoot = blockElement.querySelector<InlineRootElement>(
      `[${INLINE_ROOT_ATTR}]`
    );
    if (!inlineRoot) {
      throw new Error('Inline editor root not found');
    }
    return inlineRoot.inlineEditor;
  };

  const _getPrefixText = (inlineEditor: InlineEditor) => {
    const inlineRange = inlineEditor.getInlineRange();
    assertExists(inlineRange);
    const [leafStart, offsetStart] = inlineEditor.getTextPoint(
      inlineRange.index
    );
    return leafStart.textContent
      ? leafStart.textContent.slice(0, offsetStart)
      : '';
  };

  const _preventDefault = (ctx: UIEventStateContext) => {
    const state = ctx.get('defaultState');
    state.event.preventDefault();
  };

  const _selectAllText = () => {
    selection.update(selList => {
      return selList.map(sel => {
        if (!PathFinder.equals(sel.path, blockElement.path)) {
          return sel;
        }
        return selection.getInstance('text', {
          from: {
            path: blockElement.path,
            index: 0,
            length: blockElement.model.text?.length ?? 0,
          },
          to: null,
        });
      });
    });
    return true;
  };

  blockElement.bindHotKey({
    ArrowUp: ctx => {
      _preventDefault(ctx);
    },
    ArrowDown: ctx => {
      _preventDefault(ctx);
    },
    ArrowRight: ctx => {
      if (blockElement.selected?.is('block')) {
        return _selectText(false);
      }

      if (!blockElement.selected?.is('text')) return;
      const inlineEditor = _getInlineEditor();
      const inlineRange = inlineEditor.getInlineRange();
      if (!inlineRange) {
        return;
      }

      if (
        inlineRange.length === 0 &&
        inlineRange.index === inlineEditor.yText.length
      ) {
        _preventDefault(ctx);
        return;
      }

      return true;
    },
    ArrowLeft: ctx => {
      if (blockElement.selected?.is('block')) {
        return _selectText(true);
      }
      if (!blockElement.selected?.is('text')) return;
      const inlineEditor = _getInlineEditor();
      const inlineRange = inlineEditor.getInlineRange();
      if (!inlineRange) return;

      if (inlineRange.length === 0 && inlineRange.index === 0) {
        _preventDefault(ctx);
        return;
      }

      return true;
    },
    'Shift-ArrowUp': ctx => {
      _preventDefault(ctx);
    },
    'Shift-ArrowDown': ctx => {
      _preventDefault(ctx);
    },
    'Shift-ArrowRight': ctx => {
      _preventDefault(ctx);
    },
    'Shift-ArrowLeft': ctx => {
      _preventDefault(ctx);
    },
    Escape: () => {
      if (blockElement.selected?.is('text')) {
        return _selectBlock();
      }
      return;
    },
    Enter: ctx => {
      if (blockElement.selected?.is('block')) {
        return _selectText(false);
      }
      if (!blockElement.selected?.is('text')) {
        return;
      }
      blockElement.model.page.captureSync();

      const inlineEditor = _getInlineEditor();
      const inlineRange = inlineEditor.getInlineRange();
      assertExists(inlineRange);

      if (
        !tryConvertBlock(
          blockElement,
          inlineEditor,
          _getPrefixText(inlineEditor),
          inlineRange
        )
      ) {
        _preventDefault(ctx);
        return true;
      }

      const state = ctx.get('keyboardState');
      hardEnter(model, inlineRange, inlineEditor, state.raw);
      _preventDefault(ctx);

      return true;
    },
    'Mod-Enter': ctx => {
      if (!blockElement.selected?.is('text')) return;

      const state = ctx.get('keyboardState');
      const inlineEditor = _getInlineEditor();
      const inlineRange = inlineEditor.getInlineRange();
      assertExists(inlineRange);
      hardEnter(model, inlineRange, inlineEditor, state.raw, true);
      _preventDefault(ctx);

      return true;
    },
    Space: ctx => handleMarkdown(ctx),
    'Shift-Space': ctx => handleMarkdown(ctx),
    'Mod-a': ctx => {
      _preventDefault(ctx);
      if (!blockElement.selected?.is('text')) return;

      const text = blockElement.selected;
      const inlineRoot = blockElement.querySelector<InlineRootElement>(
        `[${INLINE_ROOT_ATTR}]`
      );
      if (
        text.from.index === 0 &&
        text.from.length === inlineRoot?.inlineEditor.yText.length
      ) {
        return _selectBlock();
      }

      return _selectAllText();
    },
    Tab: ctx => {
      if (
        !(
          blockElement.selected?.is('block') ||
          blockElement.selected?.is('text')
        )
      )
        return;

      const textModels = getSelectedContentModels(root, ['text']);
      if (textModels.length === 1) {
        const inlineEditor = _getInlineEditor();
        const inilneRange = inlineEditor.getInlineRange();
        assertExists(inilneRange);
        handleIndent(model.page, model, inilneRange.index);
        _preventDefault(ctx);

        return true;
      }

      const models = getSelectedContentModels(root, ['text', 'block']);
      handleMultiBlockIndent(blockElement.page, models);
      return true;
    },
    'Mod-Backspace': ctx => {
      if (
        !(
          blockElement.selected?.is('block') ||
          blockElement.selected?.is('text')
        )
      )
        return;

      const page = blockElement.closest<PageBlockComponent>(
        'affine-doc-page,affine-edgeless-page'
      );
      if (!page) return;

      const textModels = getSelectedContentModels(root, ['text']);
      if (textModels.length === 1) {
        const inlineEditor = _getInlineEditor();
        const inlineRange = inlineEditor.getInlineRange();
        assertExists(inlineRange);
        if (inlineRange.index === 0) {
          handleRemoveAllIndent(model.page, model, inlineRange.index);
          _preventDefault(ctx);
        }

        return true;
      }

      const models = getSelectedContentModels(root, ['text', 'block']);
      handleRemoveAllIndentForMultiBlocks(blockElement.page, models);
      return true;
    },
    'Shift-Tab': ctx => {
      if (
        !(
          blockElement.selected?.is('block') ||
          blockElement.selected?.is('text')
        )
      )
        return;

      const page = blockElement.closest<PageBlockComponent>(
        'affine-doc-page,affine-edgeless-page'
      );
      if (!page) return;

      const textModels = getSelectedContentModels(root, ['text']);
      if (textModels.length === 1) {
        const inlineEditor = _getInlineEditor();
        const inlineRange = inlineEditor.getInlineRange();
        assertExists(inlineRange);
        handleUnindent(model.page, model, inlineRange.index);
        _preventDefault(ctx);

        return true;
      }

      const models = getSelectedContentModels(root, ['text', 'block']);
      handleMultiBlockOutdent(blockElement.page, models);
      return true;
    },
    Backspace: ctx => {
      if (!blockElement.selected?.is('text')) return;
      const state = ctx.get('keyboardState');
      const inlineEditor = _getInlineEditor();
      if (!onBackspace(model, state.raw, inlineEditor)) {
        _preventDefault(ctx);
      }

      // Auto delete bracket right
      if (matchFlavours(blockElement.model, ['affine:code'])) {
        const inlineRange = inlineEditor.getInlineRange();
        assertExists(inlineRange);
        const left = inlineEditor.yText.toString()[inlineRange.index - 1];
        const right = inlineEditor.yText.toString()[inlineRange.index];
        if (bracketPairs[leftBrackets.indexOf(left)]?.right === right) {
          const index = inlineRange.index - 1;
          inlineEditor.deleteText({
            index: index,
            length: 2,
          });
          inlineEditor.setInlineRange({
            index: index,
            length: 0,
          });
          _preventDefault(ctx);
        }
      }
      return true;
    },
    Delete: ctx => handleDelete(ctx),
    'Control-d': ctx => {
      if (IS_MAC) handleDelete(ctx);
    },
  });

  textFormatConfigs.forEach(config => {
    if (!config.hotkey) return;

    blockElement.bindHotKey({
      [config.hotkey]: ctx => {
        if (blockElement.page.readonly) return;

        const textSelection = blockElement.selection.find('text');
        if (!textSelection) return;

        _preventDefault(ctx);

        config.action(root);
        return true;
      },
    });
  });

  function handleMarkdown(ctx: UIEventStateContext) {
    if (!blockElement.selected?.is('text')) return;

    const inlineEditor = _getInlineEditor();
    const inlineRange = inlineEditor.getInlineRange();
    assertExists(inlineRange);

    const prefixText = _getPrefixText(inlineEditor);

    if (!tryConvertBlock(blockElement, inlineEditor, prefixText, inlineRange)) {
      _preventDefault(ctx);
    }

    return true;
  }

  function handleDelete(ctx: UIEventStateContext) {
    if (!blockElement.selected?.is('text')) return;
    const state = ctx.get('keyboardState');
    const inlineEditor = _getInlineEditor();
    if (!onForwardDelete(model, state.raw, inlineEditor)) {
      _preventDefault(ctx);
    }
    return true;
  }

  function tryConvertToLinkedPage() {
    const pageBlock = blockElement.host.view.viewFromPath(
      'block',
      buildPath(model.page.root)
    );
    assertExists(pageBlock);
    const linkedPageWidgetEle =
      pageBlock.widgetElements['affine-linked-page-widget'];
    if (!linkedPageWidgetEle) return false;

    const inlineEditor = _getInlineEditor();
    const inlineRange = inlineEditor.getInlineRange();
    assertExists(inlineRange);
    const text = inlineEditor.yText.toString();
    const left = text[inlineRange.index - 1];
    const right = text[inlineRange.index + inlineRange.length];
    const needConvert = left === '[' && right === ']';
    if (!needConvert) return false;

    const pageName = text.slice(
      inlineRange.index,
      inlineRange.index + inlineRange.length
    );
    inlineEditor.deleteText({
      index: inlineRange.index - 1,
      length: inlineRange.length + 2,
    });
    inlineEditor.setInlineRange({ index: inlineRange.index - 1, length: 0 });

    createDefaultPage(blockElement.page.workspace, {
      title: pageName,
    })
      .then(page => {
        insertLinkedNode({ model: blockElement.model, pageId: page.id });
      })
      .catch(e => console.error(e));
    return true;
  }

  // Bracket auto complete
  bracketPairs.forEach(pair => {
    blockElement.bindHotKey({
      [pair.left]: ctx => {
        if (blockElement.page.readonly) return;

        const textSelection = blockElement.selection.find('text');
        if (!textSelection) return;
        // When selection is collapsed, only trigger auto complete in code block
        if (
          textSelection.isCollapsed() &&
          !matchFlavours(blockElement.model, ['affine:code'])
        )
          return;
        if (!textSelection.isInSameBlock()) return;

        _preventDefault(ctx);

        const inlineEditor = _getInlineEditor();
        const inlineRange = inlineEditor.getInlineRange();
        assertExists(inlineRange);
        const selectedText = inlineEditor.yText
          .toString()
          .slice(inlineRange.index, inlineRange.index + inlineRange.length);
        if (pair.name === 'square bracket') {
          // [[Selected text]] should automatically be converted to a Linked page with the title "Selected text".
          // See https://github.com/toeverything/blocksuite/issues/2730
          const success = tryConvertToLinkedPage();
          if (success) return;
        }
        inlineEditor.insertText(
          inlineRange,
          pair.left + selectedText + pair.right
        );

        inlineEditor.setInlineRange({
          index: inlineRange.index + 1,
          length: inlineRange.length,
        });

        return true;
      },
    });
  });

  // Skip redundant right bracket
  bracketPairs.forEach(pair => {
    blockElement.bindHotKey({
      [pair.right]: ctx => {
        if (!matchFlavours(blockElement.model, ['affine:code'])) return;
        const inlineEditor = _getInlineEditor();
        const inlineRange = inlineEditor.getInlineRange();
        assertExists(inlineRange);
        const left = inlineEditor.yText.toString()[inlineRange.index - 1];
        const right = inlineEditor.yText.toString()[inlineRange.index];
        if (pair.left === left && pair.right === right) {
          inlineEditor.setInlineRange({
            index: inlineRange.index + 1,
            length: 0,
          });
          _preventDefault(ctx);
        }
      },
    });
  });

  // Convert the selected text into inline code
  blockElement.bindHotKey({
    '`': ctx => {
      if (blockElement.page.readonly) return;

      const textSelection = blockElement.selection.find('text');
      if (!textSelection || textSelection.isCollapsed()) return;
      if (!textSelection.isInSameBlock()) return;

      _preventDefault(ctx);
      const inlineEditor = _getInlineEditor();
      const inlineRange = inlineEditor.getInlineRange();
      assertExists(inlineRange);
      inlineEditor.formatText(inlineRange, { code: true });

      inlineEditor.setInlineRange({
        index: inlineRange.index,
        length: inlineRange.length,
      });

      return true;
    },
  });
};
