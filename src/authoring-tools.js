/**
 * Chegg Authoring Tools - Comprehensive formatting system
 * Implements Chegg's authoring guidelines for answer formatting
 * Version: 3.0 (July 2025 Compatible)
 */

const CheggAuthoringTools = {

  // ============================================================================
  // TEXT FORMATTING TOOLS
  // ============================================================================

  /**
   * Apply bold formatting to text
   * Chegg uses: **text** or <b>text</b>
   */
  makeBold(text) {
    return `**${text}**`;
  },

  /**
   * Apply italic formatting to text
   * Chegg uses: *text* or <i>text</i>
   */
  makeItalic(text) {
    return `*${text}*`;
  },

  /**
   * Apply underline formatting
   * Chegg uses: <u>text</u>
   */
  makeUnderline(text) {
    return `<u>${text}</u>`;
  },

  /**
   * Apply subscript formatting (e.g., H₂O)
   * Chegg uses: <sub>text</sub>
   */
  makeSubscript(text) {
    return `<sub>${text}</sub>`;
  },

  /**
   * Apply superscript formatting (e.g., x²)
   * Chegg uses: <sup>text</sup>
   */
  makeSuperscript(text) {
    return `<sup>${text}</sup>`;
  },

  /**
   * Apply strikethrough formatting
   */
  makeStrikethrough(text) {
    return `~~${text}~~`;
  },

  // ============================================================================
  // MATHEMATICAL EQUATION FORMATTING
  // ============================================================================

  /**
   * Format inline LaTeX equation
   * Chegg uses: \( equation \) or $ equation $
   */
  formatInlineMath(latex) {
    return `\\(${latex}\\)`;
  },

  /**
   * Format display LaTeX equation (centered, on its own line)
   * Chegg uses: \[ equation \] or $$ equation $$
   */
  formatDisplayMath(latex) {
    return `\\[${latex}\\]`;
  },

  /**
   * Format aligned equations
   */
  formatAlignedEquations(equations) {
    const alignedContent = equations.map(eq => eq).join(' \\\\\n');
    return `\\[\\begin{aligned}\n${alignedContent}\n\\end{aligned}\\]`;
  },

  /**
   * Common mathematical symbols mapping
   */
  mathSymbols: {
    'alpha': '\\alpha',
    'beta': '\\beta',
    'gamma': '\\gamma',
    'delta': '\\delta',
    'epsilon': '\\epsilon',
    'theta': '\\theta',
    'lambda': '\\lambda',
    'mu': '\\mu',
    'pi': '\\pi',
    'sigma': '\\sigma',
    'omega': '\\omega',
    'infinity': '\\infty',
    'integral': '\\int',
    'sum': '\\sum',
    'product': '\\prod',
    'sqrt': '\\sqrt',
    'partial': '\\partial',
    'nabla': '\\nabla',
    'pm': '\\pm',
    'times': '\\times',
    'div': '\\div',
    'neq': '\\neq',
    'leq': '\\leq',
    'geq': '\\geq',
    'approx': '\\approx',
    'equiv': '\\equiv',
  },

  /**
   * Convert common text patterns to LaTeX
   */
  autoConvertToLatex(text) {
    let result = text;

    // Fractions: a/b -> \frac{a}{b}
    result = result.replace(/(\d+)\/(\d+)/g, '\\frac{$1}{$2}');

    // Exponents: x^2 -> x^{2}
    result = result.replace(/\^(\d+)/g, '^{$1}');

    // Square roots: sqrt(x) -> \sqrt{x}
    result = result.replace(/sqrt\(([^)]+)\)/gi, '\\sqrt{$1}');

    // Common symbols
    result = result.replace(/\binfinity\b/gi, '\\infty');
    result = result.replace(/\balpha\b/gi, '\\alpha');
    result = result.replace(/\bbeta\b/gi, '\\beta');
    result = result.replace(/\bdelta\b/gi, '\\delta');
    result = result.replace(/\btheta\b/gi, '\\theta');
    result = result.replace(/\bpi\b/gi, '\\pi');

    // Inequality symbols
    result = result.replace(/<=/g, '\\leq');
    result = result.replace(/>=/g, '\\geq');
    result = result.replace(/!=/g, '\\neq');

    return result;
  },

  // ============================================================================
  // TABLE FORMATTING
  // ============================================================================

  /**
   * Create a markdown table
   * @param {Array<Array<string>>} data - 2D array of table data
   * @param {Array<string>} headers - Column headers
   * @param {Array<string>} alignment - ['left', 'center', 'right'] for each column
   */
  createTable(data, headers = null, alignment = null) {
    if (!data || !data.length) return '';

    const colCount = headers ? headers.length : data[0].length;
    const align = alignment || Array(colCount).fill('left');

    let table = '';

    // Headers
    if (headers) {
      table += '| ' + headers.join(' | ') + ' |\n';
      table += '| ' + align.map(a => {
        if (a === 'center') return ':---:';
        if (a === 'right') return '---:';
        return ':---';
      }).join(' | ') + ' |\n';
    }

    // Data rows
    for (const row of data) {
      table += '| ' + row.join(' | ') + ' |\n';
    }

    return table;
  },

  /**
   * Create HTML table (for more complex formatting)
   */
  createHTMLTable(data, headers = null, hasHeaderRow = false) {
    let html = '<table border="1" style="border-collapse: collapse; width: 100%;">\n';

    if (headers) {
      html += '  <thead>\n    <tr>\n';
      headers.forEach(h => {
        html += `      <th style="padding: 8px; text-align: left;">${h}</th>\n`;
      });
      html += '    </tr>\n  </thead>\n';
    }

    html += '  <tbody>\n';
    data.forEach(row => {
      html += '    <tr>\n';
      row.forEach(cell => {
        html += `      <td style="padding: 8px;">${cell}</td>\n`;
      });
      html += '    </tr>\n';
    });
    html += '  </tbody>\n</table>';

    return html;
  },

  // ============================================================================
  // LIST FORMATTING
  // ============================================================================

  /**
   * Create bulleted list
   */
  createBulletedList(items) {
    return items.map(item => `• ${item}`).join('\n');
  },

  /**
   * Create numbered list
   */
  createNumberedList(items, startNum = 1) {
    return items.map((item, i) => `${startNum + i}. ${item}`).join('\n');
  },

  /**
   * Create lettered list (a, b, c...)
   */
  createLetteredList(items) {
    return items.map((item, i) =>
      `${String.fromCharCode(97 + i)}. ${item}`
    ).join('\n');
  },

  // ============================================================================
  // STEP-BY-STEP SOLUTION FORMATTING
  // ============================================================================

  /**
   * Format a single step
   * Chegg format: Step N: [Title]
   */
  formatStep(stepNumber, title, content, explanation = null) {
    let step = `## Step ${stepNumber}`;
    if (title) {
      step += `: ${title}`;
    }
    step += '\n\n';
    step += content;

    if (explanation) {
      step += '\n\n' + this.makeBold('Explanation:') + ' ' + explanation;
    }

    return step;
  },

  /**
   * Format complete step-by-step solution
   */
  formatStepBystepSolution(steps, finalAnswer = null) {
    let solution = '';

    steps.forEach((step, index) => {
      solution += this.formatStep(
        index + 1,
        step.title || '',
        step.content || '',
        step.explanation || null
      );
      solution += '\n\n';
    });

    if (finalAnswer) {
      solution += this.formatFinalAnswer(finalAnswer);
    }

    return solution;
  },

  /**
   * Auto-detect and format steps from plain text
   */
  autoFormatSteps(text) {
    const lines = text.split('\n');
    const steps = [];
    let currentStep = null;

    lines.forEach(line => {
      const stepMatch = line.match(/^(?:step\s*)?(\d+)[:.]\s*(.+)/i);
      if (stepMatch) {
        if (currentStep) {
          steps.push(currentStep);
        }
        currentStep = {
          number: parseInt(stepMatch[1]),
          title: stepMatch[2],
          content: []
        };
      } else if (currentStep && line.trim()) {
        currentStep.content.push(line);
      }
    });

    if (currentStep) {
      steps.push(currentStep);
    }

    return steps.map(step => ({
      title: step.title,
      content: step.content.join('\n')
    }));
  },

  // ============================================================================
  // FINAL ANSWER FORMATTING
  // ============================================================================

  /**
   * Format final answer with proper highlighting
   * Chegg requires clear final answer marking
   */
  formatFinalAnswer(answer) {
    return `## Final Answer\n\n${this.makeBold(answer)}`;
  },

  /**
   * Format final answer in a box
   */
  formatFinalAnswerBox(answer) {
    return `
---
## ${this.makeBold('FINAL ANSWER')}

${answer}
---
`;
  },

  /**
   * Extract and format final answer from text
   */
  extractAndFormatFinalAnswer(text) {
    const patterns = [
      /(?:final\s+answer|answer|conclusion|result)[:\s]+(.+?)(?:\n|$)/i,
      /(?:therefore|thus|hence)[,:\s]+(.+?)(?:\n|$)/i,
      /(?:the\s+answer\s+is)[:\s]+(.+?)(?:\n|$)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return this.formatFinalAnswer(match[1].trim());
      }
    }

    return null;
  },

  // ============================================================================
  // CODE FORMATTING
  // ============================================================================

  /**
   * Format inline code
   */
  formatInlineCode(code) {
    return `\`${code}\``;
  },

  /**
   * Format code block with language syntax highlighting
   */
  formatCodeBlock(code, language = '') {
    return `\`\`\`${language}\n${code}\n\`\`\``;
  },

  // ============================================================================
  // CHEMICAL EQUATION FORMATTING
  // ============================================================================

  /**
   * Format chemical equation
   * Uses subscripts and superscripts
   */
  formatChemicalEquation(equation) {
    let formatted = equation;

    // Format subscripts (numbers after elements)
    formatted = formatted.replace(/([A-Z][a-z]?)(\d+)/g, '$1<sub>$2</sub>');

    // Format charges (superscripts)
    formatted = formatted.replace(/\^([\d+-]+)/g, '<sup>$1</sup>');

    // Format arrows
    formatted = formatted.replace(/->/g, '→');
    formatted = formatted.replace(/<->/g, '⇌');
    formatted = formatted.replace(/<-/g, '←');

    return formatted;
  },

  /**
   * Format chemical formula
   */
  formatChemicalFormula(formula) {
    return formula.replace(/(\d+)/g, '<sub>$1</sub>');
  },

  // ============================================================================
  // UNIT AND MEASUREMENT FORMATTING
  // ============================================================================

  /**
   * Format units with proper spacing and symbols
   */
  formatUnits(value, unit) {
    const unitSymbols = {
      'meter': 'm',
      'meters': 'm',
      'kilometer': 'km',
      'kilometers': 'km',
      'centimeter': 'cm',
      'centimeters': 'cm',
      'millimeter': 'mm',
      'millimeters': 'mm',
      'gram': 'g',
      'grams': 'g',
      'kilogram': 'kg',
      'kilograms': 'kg',
      'second': 's',
      'seconds': 's',
      'minute': 'min',
      'minutes': 'min',
      'hour': 'h',
      'hours': 'h',
      'newton': 'N',
      'newtons': 'N',
      'joule': 'J',
      'joules': 'J',
      'watt': 'W',
      'watts': 'W',
      'pascal': 'Pa',
      'kelvin': 'K',
      'celsius': '°C',
      'fahrenheit': '°F',
      'mole': 'mol',
      'moles': 'mol',
      'liter': 'L',
      'liters': 'L',
      'milliliter': 'mL',
      'milliliters': 'mL',
    };

    const symbol = unitSymbols[unit.toLowerCase()] || unit;
    return `${value} ${symbol}`;
  },

  /**
   * Format scientific notation
   */
  formatScientificNotation(coefficient, exponent) {
    return `${coefficient} × 10${this.makeSuperscript(exponent)}`;
  },

  // ============================================================================
  // COMPREHENSIVE AUTO-FORMATTER
  // ============================================================================

  /**
   * Automatically format pasted answer text according to Chegg guidelines
   * This is the main function to call when user pastes an answer
   */
  autoFormatAnswer(rawText) {
    let formatted = rawText.trim();

    // 1. Detect and format steps
    const detectedSteps = this.autoFormatSteps(formatted);
    if (detectedSteps.length > 0) {
      formatted = this.formatStepBystepSolution(detectedSteps);
    }

    // 2. Convert mathematical expressions to LaTeX
    formatted = this.enhanceMathematicalContent(formatted);

    // 3. Format chemical equations if detected
    formatted = this.enhanceChemicalContent(formatted);

    // 4. Extract and format final answer
    const finalAnswer = this.extractAndFormatFinalAnswer(formatted);
    if (finalAnswer && !formatted.includes('## Final Answer')) {
      formatted += '\n\n' + finalAnswer;
    }

    // 5. Improve formatting of lists
    formatted = this.enhanceListFormatting(formatted);

    // 6. Clean up spacing
    formatted = this.cleanupSpacing(formatted);

    return formatted;
  },

  /**
   * Enhance mathematical content in text
   */
  enhanceMathematicalContent(text) {
    let result = text;

    // Find and format mathematical expressions
    // Pattern: numbers with operations, fractions, etc.
    const mathPatterns = [
      // Fractions like "1/2" or "x/y"
      /(\b\w+\/\w+\b)/g,
      // Equations with equals
      /(\w+\s*=\s*[^=\n]+)/g,
    ];

    // Don't auto-convert everything - be conservative
    // Just make sure existing math notation is clean

    return result;
  },

  /**
   * Enhance chemical content in text
   */
  enhanceChemicalContent(text) {
    let result = text;

    // Detect common chemical formulas and format them
    const chemicalPatterns = [
      /\b([A-Z][a-z]?\d+)+\b/g, // H2O, CO2, etc.
    ];

    // Be conservative - only format obvious chemical formulas
    const commonFormulas = ['H2O', 'CO2', 'O2', 'N2', 'H2SO4', 'NaCl', 'CaCO3'];
    commonFormulas.forEach(formula => {
      const regex = new RegExp(`\\b${formula}\\b`, 'g');
      result = result.replace(regex, this.formatChemicalFormula(formula));
    });

    return result;
  },

  /**
   * Enhance list formatting
   */
  enhanceListFormatting(text) {
    let result = text;

    // Ensure consistent bullet points
    result = result.replace(/^[\*\-]\s+/gm, '• ');

    // Ensure consistent numbered lists
    result = result.replace(/^(\d+)\)\s+/gm, '$1. ');

    return result;
  },

  /**
   * Clean up spacing and formatting
   */
  cleanupSpacing(text) {
    let result = text;

    // Remove excessive blank lines (more than 2 consecutive)
    result = result.replace(/\n{3,}/g, '\n\n');

    // Ensure proper spacing after headers
    result = result.replace(/^(#{1,6}\s+.+)$/gm, '$1\n');

    // Remove trailing spaces
    result = result.split('\n').map(line => line.trimEnd()).join('\n');

    return result.trim();
  },

  // ============================================================================
  // GUIDELINE VALIDATION
  // ============================================================================

  /**
   * Check answer against Chegg guidelines
   * Returns object with validation results
   */
  validateAnswer(text) {
    const issues = [];
    const warnings = [];
    const suggestions = [];

    // Check 1: Minimum length (Chegg typically requires substantial answers)
    if (text.length < 100) {
      issues.push('Answer is too short. Provide detailed explanation.');
    }

    // Check 2: Has step-by-step format?
    const hasSteps = /step\s*\d+/i.test(text);
    if (!hasSteps && text.length > 300) {
      warnings.push('Consider using step-by-step format for complex problems.');
    }

    // Check 3: Has final answer?
    const hasFinalAnswer = /(?:final\s+answer|conclusion|therefore)/i.test(text);
    if (!hasFinalAnswer) {
      issues.push('Missing clear final answer. Add a conclusion.');
    }

    // Check 4: Has explanation?
    const hasExplanation = /(?:because|since|explanation|this is|we can see)/i.test(text);
    if (!hasExplanation) {
      warnings.push('Add explanations to help students understand the solution.');
    }

    // Check 5: Proper formatting?
    const hasFormatting = /\*\*|\*|__|_|`|\[|\]|\$|\\/.test(text);
    if (!hasFormatting && text.length > 200) {
      suggestions.push('Use formatting (bold, italic, math) to improve readability.');
    }

    // Check 6: Check for plagiarism indicators (very basic)
    const suspiciousPatterns = [
      'according to',
      'as stated in',
      'reference:',
      'source:',
      'bibliography',
    ];
    suspiciousPatterns.forEach(pattern => {
      if (text.toLowerCase().includes(pattern)) {
        warnings.push('Ensure answer is in your own words, not copied from sources.');
      }
    });

    // Check 7: Grammar basics (simple checks)
    if (text.split(/[.!?]/).some(sentence => sentence.length > 200)) {
      suggestions.push('Break down long sentences for better readability.');
    }

    return {
      isValid: issues.length === 0,
      score: Math.max(0, 100 - (issues.length * 20) - (warnings.length * 10) - (suggestions.length * 5)),
      issues,
      warnings,
      suggestions,
      summary: issues.length === 0
        ? 'Answer meets basic Chegg guidelines!'
        : 'Answer needs improvements before submission.'
    };
  },

  /**
   * Generate guidelines report
   */
  generateGuidelinesReport(validationResult) {
    let report = `# Answer Quality Report\n\n`;
    report += `**Score: ${validationResult.score}/100**\n\n`;
    report += `**Status: ${validationResult.summary}**\n\n`;

    if (validationResult.issues.length > 0) {
      report += `## ❌ Critical Issues\n`;
      validationResult.issues.forEach(issue => {
        report += `- ${issue}\n`;
      });
      report += '\n';
    }

    if (validationResult.warnings.length > 0) {
      report += `## ⚠️ Warnings\n`;
      validationResult.warnings.forEach(warning => {
        report += `- ${warning}\n`;
      });
      report += '\n';
    }

    if (validationResult.suggestions.length > 0) {
      report += `## 💡 Suggestions\n`;
      validationResult.suggestions.forEach(suggestion => {
        report += `- ${suggestion}\n`;
      });
      report += '\n';
    }

    report += `\n---\n`;
    report += `### Key Chegg Guidelines:\n`;
    report += `1. Provide step-by-step detailed solutions\n`;
    report += `2. Include clear explanations for each step\n`;
    report += `3. Format mathematical equations properly\n`;
    report += `4. Highlight the final answer clearly\n`;
    report += `5. Use proper grammar and academic language\n`;
    report += `6. Ensure answer is original and not plagiarized\n`;
    report += `7. Use formatting (bold, italic) to emphasize key points\n`;

    return report;
  },

  // ============================================================================
  // CODE SNIPPET TOOL
  // ============================================================================

  /**
   * Format code snippet with syntax highlighting
   * @param {string} code - The code to format
   * @param {string} language - Programming language (e.g., 'python', 'javascript', 'java')
   * @param {boolean} showLineNumbers - Whether to show line numbers
   */
  formatCodeSnippet(code, language = 'text', showLineNumbers = true) {
    // Mark for Chegg's code snippet tool
    return `\`\`\`${language}${showLineNumbers ? ':linenos' : ''}\n${code}\n\`\`\``;
  },

  /**
   * Detect if text contains code
   */
  detectCode(text) {
    const codePatterns = [
      /\b(def|class|function|const|let|var|import|from|public|private|void)\b/,
      /[{}\[\]();]/,
      /\b(if|else|for|while|return|print|console\.log)\b/,
      /^[\s]*#include|^[\s]*import/m,
    ];
    return codePatterns.some(pattern => pattern.test(text));
  },

  // ============================================================================
  // ACCOUNTING TABLES (JOURNAL ENTRY & T-ACCOUNT)
  // ============================================================================

  /**
   * Create Journal Entry Table
   * @param {Array} entries - Array of {account, debit, credit} objects
   * @param {string} title - Optional title for the journal entry
   */
  createJournalEntry(entries, title = '') {
    let table = title ? `**${title}**\n\n` : '';
    table += '| Account | Debit | Credit |\n';
    table += '|:--------|------:|-------:|\n';

    entries.forEach(entry => {
      const debit = entry.debit || '';
      const credit = entry.credit || '';
      table += `| ${entry.account} | ${debit} | ${credit} |\n`;
    });

    // Add totals
    const totalDebit = entries.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
    const totalCredit = entries.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
    table += `| **Total** | **${totalDebit.toFixed(2)}** | **${totalCredit.toFixed(2)}** |\n`;

    return table;
  },

  /**
   * Create T-Account Table
   * @param {string} accountName - Name of the account
   * @param {Array} debits - Array of {description, amount} for debit side
   * @param {Array} credits - Array of {description, amount} for credit side
   */
  createTAccount(accountName, debits = [], credits = []) {
    let output = `**${accountName}**\n\n`;
    output += '| Debit | | Credit |\n';
    output += '|:------|:-:|-------:|\n';

    const maxRows = Math.max(debits.length, credits.length);
    for (let i = 0; i < maxRows; i++) {
      const debitEntry = debits[i] ? `${debits[i].description}: ${debits[i].amount}` : '';
      const creditEntry = credits[i] ? `${credits[i].description}: ${credits[i].amount}` : '';
      output += `| ${debitEntry} | | ${creditEntry} |\n`;
    }

    // Calculate balances
    const debitTotal = debits.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    const creditTotal = credits.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
    output += `| **Balance: ${debitTotal.toFixed(2)}** | | **Balance: ${creditTotal.toFixed(2)}** |\n`;

    return output;
  },

  /**
   * Detect if text contains accounting-related content
   */
  detectAccounting(text) {
    const accountingKeywords = [
      /\b(debit|credit|journal entry|t-account|ledger|balance sheet)\b/i,
      /\b(assets|liabilities|equity|revenue|expenses)\b/i,
      /\b(dr\.|cr\.|account|transaction)\b/i,
    ];
    return accountingKeywords.some(pattern => pattern.test(text));
  },

  // ============================================================================
  // CHEMISTRY EQUATION TOOL
  // ============================================================================

  /**
   * Format chemistry equation (accessible via %% shortcut in Chegg)
   * @param {string} equation - Chemical equation
   */
  formatChemistryEquation(equation) {
    // Chegg uses %% to trigger chemistry equation tool
    return `%%${equation}%%`;
  },

  /**
   * Enhanced chemical equation formatter with arrows and symbols
   */
  formatChemicalReaction(reactants, products, conditions = '', arrowType = '->') {
    const arrowMap = {
      '->': '→',
      '<-': '←',
      '<->': '⇌',
      '=>': '⇒',
    };

    const arrow = arrowMap[arrowType] || '→';
    const conditionText = conditions ? `\\text{${conditions}}` : '';

    return `%%${reactants} \\xrightarrow{${conditionText}} ${products}%%`;
  },

  /**
   * Detect if text contains chemistry content
   */
  detectChemistry(text) {
    const chemPatterns = [
      /\b[A-Z][a-z]?\d*\+?\-?/,  // Chemical formulas like H2O, NaCl, CO2
      /\b(acid|base|pH|molarity|molar|reaction|catalyst|equilibrium)\b/i,
      /(->|<->|=>)\s*\w+/,  // Reaction arrows
      /\b(solution|concentration|titration|oxidation|reduction)\b/i,
    ];
    return chemPatterns.some(pattern => pattern.test(text));
  },

  // ============================================================================
  // MATH IN TEXT TOOL (2-LINE & 3-LINE CALCULATIONS)
  // ============================================================================

  /**
   * Create 3-Line Math in Text calculation
   * Line 1: Equation with variables
   * Line 2: Substitution with values
   * Line 3: Result
   */
  createThreeLineMath(equation, substitution, result) {
    return [
      `${equation}`,
      `= ${substitution}`,
      `= ${result}`
    ].join('\n');
  },

  /**
   * Create 2-Line Calculation (no equation, just calculation)
   * Line 1: Numerical expression
   * Line 2: Result
   */
  createTwoLineCalculation(expression, result) {
    return [
      `${expression}`,
      `= ${result}`
    ].join('\n');
  },

  /**
   * Auto-detect and format calculations
   */
  formatCalculation(text) {
    // Detect calculation patterns like "5 + 3 = 8" or "Area = π × r²"
    const calcPattern = /(.+?)\s*=\s*(.+)/;
    const match = text.match(calcPattern);

    if (match) {
      return `\\[${match[1]} = ${match[2]}\\]`;
    }
    return text;
  },

  // ============================================================================
  // EQUATION RENDERER TOOL
  // ============================================================================

  /**
   * Create multi-line equation with left and right sides
   * This maps to Chegg's Equation Renderer Tool
   */
  createEquationRenderer(leftSide, rightSide) {
    return `\\[${leftSide} = ${rightSide}\\]`;
  },

  /**
   * Create system of equations
   */
  createSystemOfEquations(equations) {
    const eqContent = equations.join(' \\\\\n');
    return `\\[\\begin{cases}\n${eqContent}\n\\end{cases}\\]`;
  },

  // ============================================================================
  // INLINE EQUATION TOOL
  // ============================================================================

  /**
   * Create inline equation (accessible via == shortcut in Chegg)
   * Chegg: Type == and press Enter to trigger inline equation tool
   */
  formatInlineEquation(equation) {
    return `\\(${equation}\\)`;
  },

  /**
   * Detect inline math patterns
   */
  detectInlineMath(text) {
    const mathPatterns = [
      /\d+[\+\-\*\/]\d+/,  // Simple arithmetic
      /[xy]\^\d+/,  // Exponents
      /\\frac|\\sqrt|\\sum|\\int/,  // LaTeX commands
      /[αβγδθλμπσω]/,  // Greek letters
    ];
    return mathPatterns.some(pattern => pattern.test(text));
  },

  // ============================================================================
  // ENHANCED TABLE TOOL
  // ============================================================================

  /**
   * Create table with advanced formatting
   * Supports cell alignment, borders, and headers
   */
  createAdvancedTable(data, options = {}) {
    const {
      headers = null,
      alignment = null,
      hasHeaderRow = false,
      hasBorders = true,
      columnWidths = null,
      currency = false,
    } = options;

    if (!data || !data.length) return '';

    const colCount = headers ? headers.length : data[0].length;
    const align = alignment || Array(colCount).fill('left');

    let table = '';

    // Headers
    if (headers) {
      table += '| ' + headers.join(' | ') + ' |\n';
      table += '| ' + align.map(a => {
        if (a === 'center') return ':---:';
        if (a === 'right') return '---:';
        return ':---';
      }).join(' | ') + ' |\n';
    }

    // Data rows with currency formatting if needed
    for (const row of data) {
      const formattedRow = currency
        ? row.map(cell => {
            const num = parseFloat(cell);
            return isNaN(num) ? cell : `$${num.toFixed(2)}`;
          })
        : row;
      table += '| ' + formattedRow.join(' | ') + ' |\n';
    }

    return table;
  },

  /**
   * Detect if text contains tabular data
   */
  detectTable(text) {
    // Check for patterns indicating tabular data
    const lines = text.split('\n');
    const hasPipes = lines.filter(line => line.includes('|')).length > 2;
    const hasAlignedSpaces = lines.some(line => /\s{3,}/.test(line));
    const hasMultipleColumns = lines.some(line => line.split(/\s{2,}|\t/).length > 2);

    return hasPipes || (hasAlignedSpaces && hasMultipleColumns);
  },

  // ============================================================================
  // CONTENT TYPE DETECTION
  // ============================================================================

  /**
   * Detect what type of content is in the text
   * Returns array of detected types
   */
  detectContentTypes(text) {
    const types = [];

    if (this.detectCode(text)) types.push('code');
    if (this.detectChemistry(text)) types.push('chemistry');
    if (this.detectAccounting(text)) types.push('accounting');
    if (this.detectTable(text)) types.push('table');
    if (this.detectInlineMath(text)) types.push('math');

    // Check for step-by-step format
    if (/step\s*\d+/i.test(text)) types.push('steps');

    // Check for lists
    if (/^[\s]*[-*•]\s+/m.test(text) || /^\s*\d+\.\s+/m.test(text)) types.push('list');

    return types;
  },

  /**
   * Get recommended tool for content
   */
  recommendTool(text) {
    const types = this.detectContentTypes(text);

    if (types.includes('code')) return 'code-snippet';
    if (types.includes('chemistry')) return 'chemistry-equation';
    if (types.includes('accounting')) return 'accounting-table';
    if (types.includes('table')) return 'table';
    if (types.includes('math')) return 'equation-renderer';
    if (types.includes('steps')) return 'step-by-step';

    return 'text-editor';
  },

  // ============================================================================
  // ENHANCED AUTO-FORMAT WITH ALL TOOLS
  // ============================================================================

  /**
   * Enhanced auto-format that detects and applies appropriate Chegg tools
   */
  enhancedAutoFormat(rawText) {
    let text = String(rawText || '').trim();
    if (!text) return '';

    // Detect content types
    const contentTypes = this.detectContentTypes(text);

    // Apply formatting based on detected types

    // 1. Handle code blocks
    if (contentTypes.includes('code')) {
      const codeBlockRegex = /```(\w+)?\n([\s\S]+?)```/g;
      text = text.replace(codeBlockRegex, (match, lang, code) => {
        return this.formatCodeSnippet(code.trim(), lang || 'text', true);
      });
    }

    // 2. Handle chemistry equations with %% markers
    text = text.replace(/%%(.+?)%%/g, (match, equation) => {
      return this.formatChemistryEquation(equation);
    });

    // 3. Handle inline equations with == markers
    text = text.replace(/==(.+?)==/g, (match, equation) => {
      return this.formatInlineEquation(equation);
    });

    // 4. Auto-detect and wrap standalone chemical formulas
    if (contentTypes.includes('chemistry')) {
      // Find lines with chemical reactions
      text = text.replace(/^(.+?)([→←⇌]|->|<->)(.+?)$/gm, (match) => {
        if (!match.includes('%%')) {
          return `%%${match}%%`;
        }
        return match;
      });
    }

    // 5. Format step-by-step solutions
    text = this.autoFormatSteps(text);

    // 6. Enhance mathematical content
    text = this.enhanceMathematicalContent(text);

    // 7. Extract and format final answer
    const finalAnswer = this.extractAndFormatFinalAnswer(text);
    if (finalAnswer && !text.includes('## Final Answer')) {
      text = text + '\n\n' + finalAnswer;
    }

    // 8. Clean up spacing
    text = this.cleanupSpacing(text);

    return text;
  },

  // ============================================================================
  // FORMATTING TOOLBAR CONFIGURATION
  // ============================================================================

  /**
   * Get toolbar configuration for UI - ENHANCED with all Chegg tools
   */
  getToolbarConfig() {
    return {
      groups: [
        {
          name: 'Text Formatting',
          tools: [
            { id: 'bold', label: 'B', title: 'Bold (Ctrl+B)', action: 'makeBold', shortcut: 'Ctrl+B' },
            { id: 'italic', label: 'I', title: 'Italic (Ctrl+I)', action: 'makeItalic', shortcut: 'Ctrl+I' },
            { id: 'underline', label: 'U', title: 'Underline (Ctrl+U)', action: 'makeUnderline', shortcut: 'Ctrl+U' },
            { id: 'subscript', label: 'x₂', title: 'Subscript', action: 'makeSubscript' },
            { id: 'superscript', label: 'x²', title: 'Superscript', action: 'makeSuperscript' },
          ]
        },
        {
          name: 'Equations & Math',
          tools: [
            { id: 'inline-equation', label: '==', title: 'Inline Equation (==)', action: 'formatInlineEquation', shortcut: '==' },
            { id: 'equation-renderer', label: '∫', title: 'Equation Renderer', action: 'createEquationRenderer' },
            { id: 'math-in-text', label: '1+2=3', title: 'Math in Text (2/3-line)', action: 'createThreeLineMath' },
          ]
        },
        {
          name: 'Chemistry',
          tools: [
            { id: 'chem-equation', label: '%%', title: 'Chemistry Equation (%%)', action: 'formatChemistryEquation', shortcut: '%%' },
            { id: 'chem-formula', label: 'H₂O', title: 'Chemical Formula', action: 'formatChemicalFormula' },
            { id: 'chem-reaction', label: '→', title: 'Chemical Reaction', action: 'formatChemicalReaction' },
          ]
        },
        {
          name: 'Tables',
          tools: [
            { id: 'table', label: '⊞', title: 'Table Tool', action: 'createAdvancedTable' },
            { id: 'journal-entry', label: 'Dr/Cr', title: 'Journal Entry Table', action: 'createJournalEntry' },
            { id: 't-account', label: 'T', title: 'T-Account Table', action: 'createTAccount' },
          ]
        },
        {
          name: 'Structure & Lists',
          tools: [
            { id: 'steps', label: '1,2,3', title: 'Format Steps', action: 'autoFormatSteps' },
            { id: 'bullet-list', label: '•', title: 'Bullet List', action: 'createBulletedList' },
            { id: 'numbered-list', label: '1.', title: 'Numbered List', action: 'createNumberedList' },
            { id: 'final-answer', label: '✓', title: 'Final Answer', action: 'formatFinalAnswer' },
          ]
        },
        {
          name: 'Code & Special',
          tools: [
            { id: 'code-snippet', label: '</>', title: 'Code Snippet', action: 'formatCodeSnippet' },
            { id: 'auto-format', label: '✨', title: 'Enhanced Auto Format', action: 'enhancedAutoFormat' },
            { id: 'validate', label: '✓✓', title: 'Validate Answer', action: 'validateAnswer' },
          ]
        },
      ]
    };
  },
};

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CheggAuthoringTools;
}
if (typeof window !== 'undefined') {
  window.CheggAuthoringTools = CheggAuthoringTools;
}
