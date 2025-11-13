/**
 * Formatting Toolbar UI Component
 * Provides visual interface for Chegg Authoring Tools
 */

class FormattingToolbar {
  constructor(targetTextarea, authoringTools) {
    this.textarea = targetTextarea;
    this.tools = authoringTools;
    this.toolbar = null;
    this.createToolbar();
  }

  createToolbar() {
    const toolbarContainer = document.createElement('div');
    toolbarContainer.className = 'chx-formatting-toolbar';
    toolbarContainer.innerHTML = `
      <div class="chx-toolbar-section">
        <div class="chx-toolbar-label">Text Format:</div>
        <button class="chx-toolbar-btn" data-action="bold" title="Bold (Ctrl+B)">
          <strong>B</strong>
        </button>
        <button class="chx-toolbar-btn" data-action="italic" title="Italic (Ctrl+I)">
          <em>I</em>
        </button>
        <button class="chx-toolbar-btn" data-action="underline" title="Underline (Ctrl+U)">
          <u>U</u>
        </button>
        <button class="chx-toolbar-btn" data-action="subscript" title="Subscript">
          x<sub>2</sub>
        </button>
        <button class="chx-toolbar-btn" data-action="superscript" title="Superscript">
          x<sup>2</sup>
        </button>
      </div>

      <div class="chx-toolbar-section">
        <div class="chx-toolbar-label">Math:</div>
        <button class="chx-toolbar-btn" data-action="inline-math" title="Inline Math">
          f(x)
        </button>
        <button class="chx-toolbar-btn" data-action="display-math" title="Display Math">
          ∫
        </button>
        <button class="chx-toolbar-btn" data-action="fraction" title="Fraction">
          ½
        </button>
        <button class="chx-toolbar-btn" data-action="sqrt" title="Square Root">
          √
        </button>
      </div>

      <div class="chx-toolbar-section">
        <div class="chx-toolbar-label">Insert:</div>
        <button class="chx-toolbar-btn" data-action="table" title="Insert Table">
          ⊞
        </button>
        <button class="chx-toolbar-btn" data-action="bullet-list" title="Bullet List">
          •
        </button>
        <button class="chx-toolbar-btn" data-action="numbered-list" title="Numbered List">
          1.
        </button>
        <button class="chx-toolbar-btn" data-action="chemical" title="Chemical Formula">
          H₂O
        </button>
        <button class="chx-toolbar-btn" data-action="code" title="Code Block">
          &lt;/&gt;
        </button>
      </div>

      <div class="chx-toolbar-section">
        <div class="chx-toolbar-label">Quick Actions:</div>
        <button class="chx-toolbar-btn chx-toolbar-btn-primary" data-action="auto-format" title="Auto Format Answer">
          ✨ Auto Format
        </button>
        <button class="chx-toolbar-btn chx-toolbar-btn-success" data-action="add-final-answer" title="Add Final Answer">
          ✓ Final Answer
        </button>
        <button class="chx-toolbar-btn" data-action="validate" title="Validate Answer">
          ✓✓ Check
        </button>
      </div>

      <div class="chx-toolbar-section chx-toolbar-section-full">
        <div class="chx-toolbar-label">Math Symbols:</div>
        <div class="chx-symbol-grid">
          ${this.createSymbolButtons()}
        </div>
      </div>
    `;

    this.toolbar = toolbarContainer;
    this.attachEventListeners();
    return toolbarContainer;
  }

  createSymbolButtons() {
    const symbols = [
      { symbol: 'α', latex: '\\alpha', label: 'alpha' },
      { symbol: 'β', latex: '\\beta', label: 'beta' },
      { symbol: 'γ', latex: '\\gamma', label: 'gamma' },
      { symbol: 'δ', latex: '\\delta', label: 'delta' },
      { symbol: 'θ', latex: '\\theta', label: 'theta' },
      { symbol: 'λ', latex: '\\lambda', label: 'lambda' },
      { symbol: 'μ', latex: '\\mu', label: 'mu' },
      { symbol: 'π', latex: '\\pi', label: 'pi' },
      { symbol: 'σ', latex: '\\sigma', label: 'sigma' },
      { symbol: 'ω', latex: '\\omega', label: 'omega' },
      { symbol: '∞', latex: '\\infty', label: 'infinity' },
      { symbol: '∫', latex: '\\int', label: 'integral' },
      { symbol: '∑', latex: '\\sum', label: 'sum' },
      { symbol: '∏', latex: '\\prod', label: 'product' },
      { symbol: '√', latex: '\\sqrt{}', label: 'sqrt' },
      { symbol: '≠', latex: '\\neq', label: 'not equal' },
      { symbol: '≤', latex: '\\leq', label: 'less than or equal' },
      { symbol: '≥', latex: '\\geq', label: 'greater than or equal' },
      { symbol: '≈', latex: '\\approx', label: 'approximately' },
      { symbol: '±', latex: '\\pm', label: 'plus minus' },
      { symbol: '×', latex: '\\times', label: 'times' },
      { symbol: '÷', latex: '\\div', label: 'divide' },
      { symbol: '→', latex: '\\rightarrow', label: 'arrow' },
      { symbol: '∂', latex: '\\partial', label: 'partial' },
    ];

    return symbols.map(s =>
      `<button class="chx-symbol-btn" data-latex="${s.latex}" title="${s.label}">${s.symbol}</button>`
    ).join('');
  }

  attachEventListeners() {
    // Action buttons
    this.toolbar.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const action = btn.dataset.action;
        this.handleAction(action);
      });
    });

    // Symbol buttons
    this.toolbar.querySelectorAll('[data-latex]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const latex = btn.dataset.latex;
        this.insertAtCursor(latex);
      });
    });
  }

  handleAction(action) {
    const selectedText = this.getSelectedText();
    let result = '';

    switch (action) {
      case 'bold':
        result = this.tools.makeBold(selectedText || 'text');
        break;
      case 'italic':
        result = this.tools.makeItalic(selectedText || 'text');
        break;
      case 'underline':
        result = this.tools.makeUnderline(selectedText || 'text');
        break;
      case 'subscript':
        result = this.tools.makeSubscript(selectedText || '2');
        break;
      case 'superscript':
        result = this.tools.makeSuperscript(selectedText || '2');
        break;
      case 'inline-math':
        result = this.tools.formatInlineMath(selectedText || 'x^2');
        break;
      case 'display-math':
        result = this.tools.formatDisplayMath(selectedText || 'x^2 + y^2 = z^2');
        break;
      case 'fraction':
        this.insertFractionDialog();
        return;
      case 'sqrt':
        result = this.tools.formatInlineMath(`\\sqrt{${selectedText || 'x'}}`);
        break;
      case 'table':
        this.insertTableDialog();
        return;
      case 'bullet-list':
        this.convertToBulletList();
        return;
      case 'numbered-list':
        this.convertToNumberedList();
        return;
      case 'chemical':
        result = this.tools.formatChemicalFormula(selectedText || 'H2O');
        break;
      case 'code':
        result = this.tools.formatCodeBlock(selectedText || 'code here', 'python');
        break;
      case 'auto-format':
        this.autoFormatEntireAnswer();
        return;
      case 'add-final-answer':
        this.addFinalAnswerSection();
        return;
      case 'validate':
        this.validateAnswer();
        return;
    }

    if (result) {
      this.replaceSelection(result);
    }
  }

  getSelectedText() {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    return this.textarea.value.substring(start, end);
  }

  replaceSelection(text) {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    const before = this.textarea.value.substring(0, start);
    const after = this.textarea.value.substring(end);

    this.textarea.value = before + text + after;
    this.textarea.selectionStart = this.textarea.selectionEnd = start + text.length;
    this.textarea.focus();

    // Trigger input event for any listeners
    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  insertAtCursor(text) {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    const before = this.textarea.value.substring(0, start);
    const after = this.textarea.value.substring(end);

    this.textarea.value = before + text + after;
    this.textarea.selectionStart = this.textarea.selectionEnd = start + text.length;
    this.textarea.focus();

    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  insertFractionDialog() {
    const numerator = prompt('Enter numerator:', '1');
    if (!numerator) return;
    const denominator = prompt('Enter denominator:', '2');
    if (!denominator) return;

    const latex = this.tools.formatInlineMath(`\\frac{${numerator}}{${denominator}}`);
    this.insertAtCursor(latex);
  }

  insertTableDialog() {
    const rows = parseInt(prompt('Number of rows:', '3'));
    if (!rows || rows < 1) return;
    const cols = parseInt(prompt('Number of columns:', '3'));
    if (!cols || cols < 1) return;

    const headers = [];
    const data = [];

    for (let c = 0; c < cols; c++) {
      headers.push(`Column ${c + 1}`);
    }

    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push('');
      }
      data.push(row);
    }

    const table = this.tools.createTable(data, headers);
    this.insertAtCursor('\n\n' + table + '\n\n');
  }

  convertToBulletList() {
    const text = this.getSelectedText() || this.textarea.value;
    const lines = text.split('\n').filter(l => l.trim());
    const list = this.tools.createBulletedList(lines);
    if (this.getSelectedText()) {
      this.replaceSelection(list);
    } else {
      this.textarea.value = list;
    }
  }

  convertToNumberedList() {
    const text = this.getSelectedText() || this.textarea.value;
    const lines = text.split('\n').filter(l => l.trim());
    const list = this.tools.createNumberedList(lines);
    if (this.getSelectedText()) {
      this.replaceSelection(list);
    } else {
      this.textarea.value = list;
    }
  }

  autoFormatEntireAnswer() {
    const currentText = this.textarea.value;
    if (!currentText.trim()) {
      alert('Please enter some text first.');
      return;
    }

    const formatted = this.tools.autoFormatAnswer(currentText);
    this.textarea.value = formatted;
    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Show success message
    this.showNotification('Answer formatted successfully!', 'success');
  }

  addFinalAnswerSection() {
    const answer = prompt('Enter the final answer:');
    if (!answer) return;

    const finalAnswerText = this.tools.formatFinalAnswer(answer);
    this.insertAtCursor('\n\n' + finalAnswerText);
  }

  validateAnswer() {
    const text = this.textarea.value;
    if (!text.trim()) {
      alert('Please enter some text first.');
      return;
    }

    const validation = this.tools.validateAnswer(text);
    const report = this.tools.generateGuidelinesReport(validation);

    // Show validation report in a modal
    this.showValidationReport(report, validation);
  }

  showValidationReport(report, validation) {
    const modal = document.createElement('div');
    modal.className = 'chx-validation-modal';
    modal.innerHTML = `
      <div class="chx-validation-content">
        <div class="chx-validation-header">
          <h2>Answer Quality Check</h2>
          <button class="chx-close-btn">&times;</button>
        </div>
        <div class="chx-validation-body">
          <div class="chx-validation-score ${validation.score >= 80 ? 'good' : validation.score >= 60 ? 'fair' : 'poor'}">
            <div class="chx-score-circle">${validation.score}</div>
            <div class="chx-score-label">Quality Score</div>
          </div>
          <div class="chx-validation-report">
            ${this.formatReportHTML(report, validation)}
          </div>
        </div>
        <div class="chx-validation-footer">
          <button class="chx-btn chx-btn-primary" data-close>Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close handlers
    modal.querySelector('.chx-close-btn').onclick = () => modal.remove();
    modal.querySelector('[data-close]').onclick = () => modal.remove();
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
  }

  formatReportHTML(report, validation) {
    let html = `<div class="chx-validation-status ${validation.isValid ? 'valid' : 'invalid'}">`;
    html += `<strong>${validation.summary}</strong>`;
    html += `</div>`;

    if (validation.issues.length > 0) {
      html += `<div class="chx-validation-section chx-issues">`;
      html += `<h3>❌ Critical Issues</h3><ul>`;
      validation.issues.forEach(issue => {
        html += `<li>${issue}</li>`;
      });
      html += `</ul></div>`;
    }

    if (validation.warnings.length > 0) {
      html += `<div class="chx-validation-section chx-warnings">`;
      html += `<h3>⚠️ Warnings</h3><ul>`;
      validation.warnings.forEach(warning => {
        html += `<li>${warning}</li>`;
      });
      html += `</ul></div>`;
    }

    if (validation.suggestions.length > 0) {
      html += `<div class="chx-validation-section chx-suggestions">`;
      html += `<h3>💡 Suggestions</h3><ul>`;
      validation.suggestions.forEach(suggestion => {
        html += `<li>${suggestion}</li>`;
      });
      html += `</ul></div>`;
    }

    return html;
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `chx-notification chx-notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  getElement() {
    return this.toolbar;
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.FormattingToolbar = FormattingToolbar;
}
