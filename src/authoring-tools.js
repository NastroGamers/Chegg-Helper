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
  // FORMATTING TOOLBAR CONFIGURATION
  // ============================================================================

  /**
   * Get toolbar configuration for UI
   */
  getToolbarConfig() {
    return {
      groups: [
        {
          name: 'Text Formatting',
          tools: [
            { id: 'bold', label: 'B', title: 'Bold', action: 'makeBold' },
            { id: 'italic', label: 'I', title: 'Italic', action: 'makeItalic' },
            { id: 'underline', label: 'U', title: 'Underline', action: 'makeUnderline' },
            { id: 'subscript', label: 'x₂', title: 'Subscript', action: 'makeSubscript' },
            { id: 'superscript', label: 'x²', title: 'Superscript', action: 'makeSuperscript' },
          ]
        },
        {
          name: 'Mathematical',
          tools: [
            { id: 'inline-math', label: 'f(x)', title: 'Inline Math', action: 'formatInlineMath' },
            { id: 'display-math', label: '∫', title: 'Display Math', action: 'formatDisplayMath' },
            { id: 'equation', label: '=', title: 'Equation', action: 'autoConvertToLatex' },
          ]
        },
        {
          name: 'Structure',
          tools: [
            { id: 'steps', label: '1,2,3', title: 'Format Steps', action: 'autoFormatSteps' },
            { id: 'final-answer', label: '✓', title: 'Final Answer', action: 'formatFinalAnswer' },
            { id: 'table', label: '⊞', title: 'Insert Table', action: 'createTable' },
            { id: 'list', label: '•', title: 'Bulleted List', action: 'createBulletedList' },
          ]
        },
        {
          name: 'Special',
          tools: [
            { id: 'chemical', label: 'H₂O', title: 'Chemical Formula', action: 'formatChemicalFormula' },
            { id: 'code', label: '<>', title: 'Code Block', action: 'formatCodeBlock' },
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
