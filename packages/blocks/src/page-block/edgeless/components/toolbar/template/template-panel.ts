import './template-loading.js';

import { WithDisposable } from '@blocksuite/lit';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import {
  requestConnectedFrame,
  stopPropagation,
} from '../../../../../_common/utils/event.js';
import { type IBound } from '../../../../../surface-block/consts.js';
import type { TemplateJob } from '../../../../../surface-block/service/template.js';
import {
  createInsertPlaceMiddleware,
  createStickerMiddleware,
} from '../../../../../surface-block/service/template-middlewares.js';
import {
  Bound,
  getCommonBound,
} from '../../../../../surface-block/utils/bound.js';
import type { EdgelessPageBlockComponent } from '../../../edgeless-page-block.js';
import { builtInTemplates } from './builtin-templates.js';
import { ArrowIcon, defaultPreview } from './icon.js';
import type { Template } from './template-type.js';

@customElement('edgeless-templates-panel')
export class EdgelessTemplatePanel extends WithDisposable(LitElement) {
  static templates = builtInTemplates;
  static override styles = css`
    :host {
      position: absolute;
      font-family: var(--affine-font-family);
      z-index: 1;
    }

    .edgeless-templates-panel {
      width: 467px;
      height: 568px;
      border-radius: 12px;
      background-color: var(--affine-background-overlay-panel-color);
      box-shadow: 0px 10px 80px 0px rgba(0, 0, 0, 0.2);

      display: flex;
      flex-direction: column;
    }

    .search-bar {
      padding: 21px 24px;
      font-size: 18px;
      color: var(--affine-secondary);
      border-bottom: 1px solid var(--affine-divider-color);

      flex-shrink: 0;
    }

    .search-input {
      border: 0;
      color: var(--affine-text-primary-color);
      font-size: 20px;
      background-color: inherit;
      outline: none;
      width: 100%;
    }

    .search-input::placeholder {
      color: var(--affine-text-secondary-color);
    }

    .template-categories {
      display: flex;
      padding: 6px 8px;
      gap: 4px;
      overflow-x: scroll;

      flex-shrink: 0;
    }

    .category-entry {
      color: var(--affine-text-primary-color);
      font-size: 12px;
      font-weight: 600;
      line-height: 20px;
      border-radius: 8px;
      flex-shrink: 0;
      flex-grow: 0;
      width: fit-content;
      padding: 4px 9px;
      cursor: pointer;
    }

    .category-entry.selected,
    .category-entry:hover {
      color: var(--affine-text-primary-color);
      background-color: var(--affine-background-tertiary-color);
    }

    .template-list {
      padding: 10px;
      display: flex;
      align-items: flex-start;
      align-content: flex-start;
      gap: 10px 20px;
      flex-wrap: wrap;

      flex-grow: 1;
      overflow-y: scroll;
    }

    .template-item {
      position: relative;
      width: 135px;
      height: 80px;
      box-shadow: 0px 4px 4px 0px rgba(0, 0, 0, 0.02);
      background-color: #fff;
      border-radius: 4px;
      cursor: pointer;
    }

    .template-item > svg {
      display: block;
      margin: 0 auto;
      transform: translateY(20%);
    }

    .template-item:hover::before {
      content: attr(data-hover-text);
      position: absolute;
      display: block;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 110px;
      border-radius: 8px;
      padding: 4px 22px;
      box-sizing: border-box;
      z-index: 1;
      text-align: center;
      font-size: 12px;

      background-color: var(--affine-primary-color);
      color: var(--affine-white);
    }

    .template-item:hover::after {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      border: 1px solid var(--affine-black-10);
      border-radius: 4px;
      background-color: var(--affine-hover-color);
    }

    .template-item.loading::before {
      display: none;
    }

    .template-item.loading > affine-template-loading {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
    }

    .template-item img.template-preview {
      object-fit: contain;
      width: 100%;
      height: 100%;
      display: block;
    }

    .arrow {
      bottom: 0;
      position: absolute;
      transform: translateY(20px);
      color: var(--affine-background-overlay-panel-color);
    }
  `;

  @state()
  private _currentCategory = '';

  @state()
  private _loadingTemplate: Template | null = null;

  @state()
  private _searchKeyword = '';

  @property({ attribute: false })
  edgeless!: EdgelessPageBlockComponent;

  get categoryCacheKey() {
    return `blocksuite:${this.edgeless.page.id}:templateTool`;
  }

  override connectedCallback(): void {
    super.connectedCallback();

    this._currentCategory =
      this._getLocalSelectedCategory() ??
      EdgelessTemplatePanel.templates.categories()[0];
    this.addEventListener('keydown', stopPropagation, false);
    this._disposables.add(() => {
      if (this._currentCategory) {
        sessionStorage.setItem(this.categoryCacheKey, this._currentCategory);
      }
    });
  }

  override firstUpdated() {
    requestConnectedFrame(() => {
      this._disposables.addFromEvent(document, 'click', evt => {
        if (this.contains(evt.target as HTMLElement)) {
          return;
        }

        this._closePanel();
      });
    }, this);
    this._disposables.addFromEvent(this, 'click', stopPropagation);
    this._disposables.addFromEvent(this, 'wheel', stopPropagation);
  }

  private _getLocalSelectedCategory() {
    return sessionStorage.getItem(this.categoryCacheKey) ?? undefined;
  }

  private _createTemplateJob(type: string) {
    const middlewares: ((job: TemplateJob) => void)[] = [];
    const surface = this.edgeless.surface;

    if (type === 'template') {
      const currentContentBound = getCommonBound(
        (
          surface.blocks.map(block => Bound.deserialize(block.xywh)) as IBound[]
        ).concat(surface.getElements())
      );

      if (currentContentBound) {
        currentContentBound.x +=
          currentContentBound.w + 20 / surface.viewport.zoom;
        middlewares.push(createInsertPlaceMiddleware(currentContentBound));
      }
    }

    if (type === 'sticker') {
      middlewares.push(
        createStickerMiddleware(surface.viewport.center, () =>
          surface.layer.generateIndex('common', 'block')
        )
      );
    }

    return this.edgeless.surface.service!.TemplateJob.create({
      model: this.edgeless.surfaceBlockModel,
      type,
      middlewares,
    });
  }

  private async _insertTemplate(template: Template) {
    this._loadingTemplate = template;

    const templateJob = this._createTemplateJob(template.type);
    const surface = this.edgeless.surface;

    try {
      const { assets } = template;

      if (assets) {
        await Promise.all(
          Object.entries(assets).map(([key, value]) =>
            fetch(value)
              .then(res => res.blob())
              .then(blob => templateJob.job.assets.set(key, blob))
          )
        );
      }

      const insertedBound = await templateJob.insertTemplate(template.content);

      if (insertedBound && template.type === 'template') {
        const padding = 20 / surface.viewport.zoom;
        surface.viewport.setViewportByBound(
          insertedBound,
          [padding, padding, padding, padding],
          true
        );
      }
    } finally {
      this._loadingTemplate = null;
      this._closePanel();
    }
  }

  private _closePanel() {
    this.dispatchEvent(new CustomEvent('closepanel'));
  }

  private _updateSearchKeyword(inputEvt: InputEvent) {
    this._searchKeyword = (inputEvt.target as HTMLInputElement).value;
  }

  override render() {
    const categories = EdgelessTemplatePanel.templates.categories();
    const templates = this._searchKeyword
      ? EdgelessTemplatePanel.templates.search(this._searchKeyword)
      : EdgelessTemplatePanel.templates.list(this._currentCategory);

    return html`
      <div class="edgeless-templates-panel">
        <div class="search-bar">
          <input
            class="search-input"
            type="text"
            placeholder="Search file or anything..."
            @input=${this._updateSearchKeyword}
          />
        </div>
        <div class="template-categories">
          ${repeat(
            categories,
            cate => cate,
            cate => {
              return html`<div
                class="category-entry ${this._currentCategory === cate
                  ? 'selected'
                  : ''}"
                @click=${() => (this._currentCategory = cate)}
              >
                ${cate}
              </div>`;
            }
          )}
        </div>
        <div class="template-list">
          ${repeat(
            templates,
            template => template.name,
            template => {
              return html`
                <div
                  class=${`template-item ${
                    template === this._loadingTemplate ? 'loading' : ''
                  }`}
                  data-hover-text="Add"
                  @click=${() => this._insertTemplate(template)}
                >
                  ${template.preview
                    ? html`<img
                        src="${template.preview}"
                        class="template-preview"
                      />`
                    : defaultPreview}
                  ${template === this._loadingTemplate
                    ? html`<affine-template-loading></affine-template-loading>`
                    : nothing}
                  ${template.name
                    ? html`<affine-tooltip .offset=${12} tip-position="top">
                        ${template.name}
                      </affine-tooltip>`
                    : nothing}
                </div>
              `;
            }
          )}
        </div>
        <div class="arrow">${ArrowIcon}</div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-templates-panel': EdgelessTemplatePanel;
  }
}
