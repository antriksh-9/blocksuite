import type { TextSelection } from '@blocksuite/block-std';
import type { EditorHost } from '@blocksuite/lit';
import { BaseBlockModel } from '@blocksuite/store';

import {
  getCurrentNativeRange,
  hasNativeSelection,
  resetNativeSelection,
  type SerializedBlock,
} from '../../../_common/utils/index.js';
import { getSelectedContentModels } from '../../../page-block/utils/selection.js';
import type { SelectedBlock } from '../../content-parser/types.js';
import { getService } from '../../service/index.js';
import { ClipboardItem } from '../clipboard-item.js';
import {
  CLIPBOARD_MIMETYPE,
  createHTMLStringForCustomData,
  performNativeCopy,
} from './pure.js';

export async function getBlockClipboardInfo(
  block: SelectedBlock | BaseBlockModel
): Promise<{ html: string; text: string; json: SerializedBlock }> {
  if (block instanceof BaseBlockModel) {
    const selectBlockInfo = blockModel2selectBlocksInfo(block);
    return await generateClipboardInfo(selectBlockInfo);
  }
  return await generateClipboardInfo(block);
}

async function generateClipboardInfo(
  block: SelectedBlock
): Promise<{ html: string; text: string; json: SerializedBlock }> {
  const model = block.model;

  const childrenHtml: string[] = [];
  const childrenText: string[] = [];
  const childrenJson: SerializedBlock[] = [];
  for (
    let currentIndex = 0;
    currentIndex < block.children.length;
    currentIndex++
  ) {
    const { html, text, json } = await getBlockClipboardInfo(
      block.children[currentIndex]
    );
    html && childrenHtml.push(html);
    text && childrenText.push(text);
    childrenJson.push(json);
  }

  const service = getService(model.flavour);

  const html = await service.block2html(model, {
    childText: childrenHtml.join(''),
    begin: block.startPos,
    end: block.endPos,
  });

  const text = service.block2Text(model, {
    childText: childrenText.join(''),
    begin: block.startPos,
    end: block.endPos,
  });

  const json = service.block2Json(
    model,
    childrenJson,
    block.startPos,
    block.endPos
  );

  return {
    html,
    text,
    json,
  };
}

function blockModel2selectBlocksInfo(
  blockModel: BaseBlockModel
): SelectedBlock {
  return {
    model: blockModel,
    children: blockModel.children.map(child =>
      blockModel2selectBlocksInfo(child)
    ),
  };
}

function selectedModels2selectBlocksInfo(
  selectedModels: BaseBlockModel[],
  textSelection?: TextSelection
) {
  const modelIdSet = new Set(selectedModels.map(model => model.id));

  const blocks: SelectedBlock[] = [];
  const parentIdMap = new Map<string, string>();
  const blocksMap = new Map<string, SelectedBlock>();
  selectedModels.forEach((model, index) => {
    for (const child of model.children) {
      if (modelIdSet.has(child.id)) {
        parentIdMap.set(child.id, model.id);
      } else {
        break;
      }
    }

    const startPos = index == 0 ? textSelection?.from.index : undefined;
    let endPos = undefined;
    if (index == selectedModels.length - 1) {
      if (textSelection?.to) {
        endPos = textSelection.to.index + textSelection.to.length;
      } else if (textSelection?.from) {
        endPos = textSelection?.from.index + textSelection?.from.length;
      }
    }

    const block: SelectedBlock = {
      model,
      startPos,
      endPos,
      children: [] as SelectedBlock[],
    };
    if (
      model.flavour === 'affine:database' ||
      (['affine:list', 'affine:paragraph'].includes(model.flavour) &&
        !textSelection)
    ) {
      const nestedBlock: SelectedBlock = blockModel2selectBlocksInfo(model);
      block.children = nestedBlock.children;
    }
    blocksMap.set(model.id, block);

    const parentBlockChildren =
      blocksMap.get(parentIdMap.get(model.id) ?? '')?.children ?? blocks;
    parentBlockChildren.push(block);
  });
  return blocks;
}

async function createPageClipboardItems(
  selectedModels: BaseBlockModel[],
  textSelection?: TextSelection
): Promise<ClipboardItem[]> {
  const blocks: SelectedBlock[] = selectedModels2selectBlocksInfo(
    selectedModels,
    textSelection
  );

  const clipGroups = await Promise.all(
    blocks.map(async block => {
      return await getBlockClipboardInfo(block);
    })
  );

  const stringifiesData = JSON.stringify(
    clipGroups.filter(group => group.json).map(group => group.json)
  );

  // Compatibility handling: In some environments, browsers do not support clipboard mime type other than `text/html` and `text/plain`, so need to store the copied json information in html
  // Playwright issue: https://github.com/microsoft/playwright/issues/18013
  const customClipboardFragment = createHTMLStringForCustomData(
    stringifiesData,
    CLIPBOARD_MIMETYPE.BLOCKSUITE_PAGE
  );

  const textClipboardItem = new ClipboardItem(
    CLIPBOARD_MIMETYPE.TEXT,
    clipGroups.reduce((text, group, index) => {
      return `${text}${group.text}${
        index === clipGroups.length - 1 ? '' : '\n'
      }`;
    }, '')
  );
  const htmlClipboardItem = new ClipboardItem(
    CLIPBOARD_MIMETYPE.HTML,
    `${clipGroups.map(group => group.html).join('')}${customClipboardFragment}`
  );
  const pageClipboardItem = new ClipboardItem(
    CLIPBOARD_MIMETYPE.BLOCKSUITE_PAGE,
    stringifiesData
  );

  return [textClipboardItem, htmlClipboardItem, pageClipboardItem];
}

export async function copyBlocksInPage(host: EditorHost) {
  const selectedModels = getSelectedContentModels(host, [
    'text',
    'block',
    'image',
  ]);
  const textSelection = host.selection.find('text');
  const clipboardItems = await createPageClipboardItems(
    selectedModels,
    textSelection
  );

  const savedRange = hasNativeSelection() ? getCurrentNativeRange() : null;

  performNativeCopy(clipboardItems);

  if (savedRange) {
    resetNativeSelection(savedRange);
  }
  return clipboardItems;
}
