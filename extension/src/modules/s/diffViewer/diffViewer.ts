/**
 * Copyright 2025 Mitch Spano
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { LightningElement, api, track } from "lwc";

export interface DiffLine {
  lineNumber: number;
  content: string;
  type?: 'added' | 'removed' | 'changed' | 'unchanged';
}

export interface DiffContent {
  sourceLines: DiffLine[];
  targetLines: DiffLine[];
}

export default class DiffViewer extends LightningElement {
  @api sourceLabel: string = 'Source Org';
  @api targetLabel: string = 'Target Org';
  @api diffContent?: DiffContent;
  @api showLineNumbers: boolean = false;
  @api showSyntaxHighlighting: boolean = false;

  @track sourceLines: DiffLine[] = [];
  @track targetLines: DiffLine[] = [];
  @track selectedLine: number = -1;
  @track isFullscreen: boolean = false;

  connectedCallback(): void {
    this.updateDiffContent();
    this.setupKeyboardShortcuts();
  }

  disconnectedCallback(): void {
    this.removeKeyboardShortcuts();
  }

  renderedCallback(): void {
    this.updateDiffContent();
  }

  private updateDiffContent(): void {
    if (this.diffContent) {
      this.sourceLines = this.diffContent.sourceLines || [];
      this.targetLines = this.diffContent.targetLines || [];
    } else {
      // Default content when no diff is available
      this.sourceLines = [
        { lineNumber: 1, content: 'Source content will be displayed here', type: 'unchanged' }
      ];
      this.targetLines = [
        { lineNumber: 1, content: 'Target content will be displayed here', type: 'unchanged' }
      ];
    }
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  private removeKeyboardShortcuts(): void {
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isFullscreen) return;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.handleClose();
        break;
      case 'f':
      case 'F':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.toggleFullscreen();
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.navigateLines(-1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.navigateLines(1);
        break;
    }
  }

  private navigateLines(direction: number): void {
    const maxLines = Math.max(this.sourceLines.length, this.targetLines.length);
    this.selectedLine = Math.max(0, Math.min(maxLines - 1, this.selectedLine + direction));
  }

  handleClose(): void {
    // Dispatch custom event to parent component
    this.dispatchEvent(new CustomEvent('close'));
  }

  handleFullscreenToggle(): void {
    this.toggleFullscreen();
  }

  private toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    
    if (this.isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  handleLineClick(event: Event): void {
    const target = event.target as HTMLElement;
    const lineElement = target.closest('.diff-line');
    if (lineElement) {
      const lineNumber = parseInt(lineElement.getAttribute('data-line') || '0');
      this.selectedLine = lineNumber;
    }
  }

  // Method to update diff content from parent
  @api
  updateDiff(sourceLines: DiffLine[], targetLines: DiffLine[]): void {
    this.sourceLines = sourceLines;
    this.targetLines = targetLines;
  }

  // Getter for CSS classes
  get containerClass(): string {
    return `diff-viewer-container ${this.isFullscreen ? 'fullscreen' : ''}`;
  }



  // Getter for statistics
  get diffStats(): { added: number; removed: number; changed: number; unchanged: number } {
    const allLines = [...this.sourceLines, ...this.targetLines];
    return {
      added: allLines.filter(line => line.type === 'added').length,
      removed: allLines.filter(line => line.type === 'removed').length,
      changed: allLines.filter(line => line.type === 'changed').length,
      unchanged: allLines.filter(line => line.type === 'unchanged').length
    };
  }
} 