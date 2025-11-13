# Chegg Authoring Tools Guide - Version 3.0

## Overview

This extension now includes **ALL Official Chegg Authoring Tools** (July 2025 compatible) to help you format answers perfectly according to Chegg's guidelines. The extension provides complete automation for all Chegg tools including equation renderers, chemistry equations, code snippets, accounting tables, and more.

## 🆕 NEW in Version 3.0 (July 2025)

✅ **Code Snippet Tool** - Syntax-highlighted code with line numbers
✅ **Chemistry Equation Tool** - Accessible via %% shortcut
✅ **Inline Equation Tool** - Accessible via == shortcut
✅ **Math in Text Tool** - 2-line and 3-line calculations
✅ **Journal Entry Tables** - Accounting-specific tables with Dr/Cr
✅ **T-Account Tables** - Visual accounting ledger format
✅ **Enhanced Table Tool** - Advanced formatting with currency, alignment
✅ **Auto-Detection** - Automatically detects content type and applies appropriate tool
✅ **Enhanced Auto-Format** - Intelligently formats using all available tools

## Complete List of Supported Chegg Tools

### Text Editor Tools
✅ Bold, Italic, Underline (Ctrl+B, Ctrl+I, Ctrl+U)
✅ Headers (H1, H2, H3, H4)
✅ Superscripts and Subscripts
✅ Text Alignment (left, center, right)
✅ Ordered and Unordered Lists

### Mathematics Tools
✅ **Equation Renderer** - Multi-line equations with live preview
✅ **Inline Equation** - Math within text (== shortcut)
✅ **Math in Text** - 2-line and 3-line automatic calculations
✅ **Display Math** - Centered equations on separate lines

### Chemistry Tools
✅ **Chemistry Equation Tool** - Chemical equations (%% shortcut)
✅ **Chemistry Drawing Tool** - Molecular structures
✅ **Chemical Formula** - Auto-format chemical formulas

### Table Tools
✅ **Advanced Table Tool** - Excel-like functions
✅ **Journal Entry Table** - Accounting Dr/Cr tables
✅ **T-Account Table** - Visual ledger format

### Code & Special Tools
✅ **Code Snippet Tool** - Syntax highlighting with line numbers
✅ **Drawing Tool** - Illustrations and diagrams
✅ **Electric Circuit Tool** - Circuit diagrams
✅ **Graphing Tool** - Data visualization
✅ **Image Upload & Labelling** - Add labels to images

## Features

### 1. **Automatic Answer Formatting**

The extension can automatically format your pasted answer text to meet Chegg standards:

- ✅ **Step-by-step structure** - Automatically detects and formats steps
- ✅ **Mathematical equations** - Converts to proper LaTeX format
- ✅ **Chemical formulas** - Auto-formats chemical notation with %% markers
- ✅ **Code snippets** - Auto-detects and formats code blocks
- ✅ **Final answer highlighting** - Clearly marks the final answer
- ✅ **List formatting** - Properly formats bulleted and numbered lists
- ✅ **Accounting tables** - Creates Journal Entry and T-Account tables
- ✅ **Clean spacing** - Removes excessive blank lines and improves readability

### 2. **Formatting Toolbar**

Access a comprehensive formatting toolbar with the following tools:

#### Text Formatting
- **Bold** (Ctrl+B) - Make text bold: `**text**`
- **Italic** (Ctrl+I) - Make text italic: `*text*`
- **Underline** (Ctrl+U) - Underline text: `<u>text</u>`
- **Subscript** - For chemical formulas: H<sub>2</sub>O
- **Superscript** - For exponents: x<sup>2</sup>

#### Mathematical Tools
- **Inline Math** - Format equations inline: `\(x^2 + y^2\)`
- **Display Math** - Format equations on separate line: `\[x^2 + y^2 = z^2\]`
- **Fraction** - Insert fractions: `\frac{a}{b}`
- **Square Root** - Insert square roots: `\sqrt{x}`

#### Structure Tools
- **Insert Table** - Create markdown tables
- **Bullet List** - Create bulleted lists
- **Numbered List** - Create numbered lists
- **Chemical Formula** - Format chemical equations
- **Code Block** - Insert code blocks with syntax highlighting

#### Quick Actions
- **✨ Auto Format** - Automatically format the entire answer
- **✓ Final Answer** - Add properly formatted final answer section
- **✓✓ Check** - Validate answer against Chegg guidelines

#### Math Symbols
Quick access to commonly used mathematical symbols:
- Greek letters: α, β, γ, δ, θ, λ, μ, π, σ, ω
- Operators: ∞, ∫, ∑, ∏, √, ≠, ≤, ≥, ≈, ±, ×, ÷, →, ∂

### 3. **Answer Validation**

The validation system checks your answer against Chegg guidelines:

✅ **Checks for:**
- Sufficient answer length
- Step-by-step format (when appropriate)
- Clear final answer
- Explanations and reasoning
- Proper formatting
- Original content (not plagiarized)
- Readability

📊 **Provides:**
- Quality score (0-100)
- Critical issues that must be fixed
- Warnings for improvements
- Suggestions for enhancements
- Detailed report with actionable feedback

## How to Use

### Method 1: Auto-Format When Pasting

1. Copy your answer text from AI or other source
2. Paste it into the answer textarea
3. Click the **"✨ Auto Format"** button in the formatting toolbar
4. Review the formatted result
5. Click **"✓✓ Check"** to validate against guidelines
6. Make any necessary adjustments
7. Click **"Paste"** to insert into Chegg's answer fields

### Method 2: Manual Formatting

1. Type or paste your answer text
2. Select the text you want to format
3. Click the appropriate formatting button in the toolbar
4. The selected text will be wrapped with proper formatting
5. Continue formatting other parts as needed
6. Validate with **"✓✓ Check"** before submitting

### Method 3: Insert Special Elements

#### Inserting a Table
1. Click the **"⊞"** button
2. Enter number of rows and columns
3. The table template will be inserted
4. Fill in your data

#### Inserting Math Equations
1. Type or select your equation
2. Click **"f(x)"** for inline math or **"∫"** for display math
3. Edit the LaTeX code as needed
4. Common conversions are automatic:
   - `x^2` → `x^{2}`
   - `1/2` → `\frac{1}{2}`
   - `sqrt(x)` → `\sqrt{x}`

#### Using Math Symbols
1. Click any symbol button in the toolbar
2. The LaTeX code will be inserted at cursor position
3. Wrap with `\( \)` for inline or `\[ \]` for display

### Method 4: Step-by-Step Solutions

The auto-formatter detects steps automatically:

```
Step 1: Understanding the problem
First, we need to identify what the question is asking...

Step 2: Setting up equations
We can write the equation as x + y = 10...

Step 3: Solving
Solving for x: x = 10 - y...

Final Answer: x = 5, y = 5
```

This will be automatically formatted with proper headings and structure.

## Formatting Examples

### Example 1: Math Problem

**Input:**
```
To solve x^2 + 5x + 6 = 0, we use the quadratic formula.
x = (-b +- sqrt(b^2 - 4ac)) / (2a)
Where a=1, b=5, c=6
x = (-5 +- sqrt(25 - 24)) / 2
x = (-5 +- 1) / 2
Therefore x = -2 or x = -3
```

**After Auto-Format:**
```
## Step 1: Identify the quadratic equation

To solve \(x^2 + 5x + 6 = 0\), we use the quadratic formula.

## Step 2: Apply the quadratic formula

\[x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}\]

Where \(a=1\), \(b=5\), \(c=6\)

## Step 3: Calculate the discriminant

\[x = \frac{-5 \pm \sqrt{25 - 24}}{2} = \frac{-5 \pm 1}{2}\]

## Final Answer

**x = -2 or x = -3**
```

### Example 2: Chemistry Problem

**Input:**
```
Balance the equation: H2 + O2 -> H2O
Step 1: Count atoms on each side
Left: H=2, O=2
Right: H=2, O=1
Step 2: Balance oxygen
2H2 + O2 -> 2H2O
Answer: 2H2 + O2 -> 2H2O
```

**After Auto-Format:**
```
## Step 1: Count atoms on each side

For the unbalanced equation: H<sub>2</sub> + O<sub>2</sub> → H<sub>2</sub>O

Left side: H=2, O=2
Right side: H=2, O=1

## Step 2: Balance oxygen

Multiply H<sub>2</sub>O by 2 to balance oxygen atoms:
2H<sub>2</sub> + O<sub>2</sub> → 2H<sub>2</sub>O

## Final Answer

**2H<sub>2</sub> + O<sub>2</sub> → 2H<sub>2</sub>O**
```

### Example 3: Programming Problem

**Input:**
```
To find the factorial of a number:
def factorial(n):
    if n == 0:
        return 1
    return n * factorial(n-1)
This uses recursion. For n=5, result is 120.
```

**After Auto-Format:**
```
## Step 1: Define the recursive function

```python
def factorial(n):
    if n == 0:
        return 1
    return n * factorial(n-1)
```

## Step 2: Understanding the logic

This function uses **recursion** to calculate the factorial:
- Base case: When n=0, return 1
- Recursive case: Multiply n by factorial(n-1)

## Final Answer

**For n=5, the factorial is 120**
```

## Validation Guidelines

The validation system checks the following criteria:

### Critical Issues (Must Fix)
- Answer too short (< 100 characters)
- No clear final answer
- Missing explanations

### Warnings (Should Fix)
- No step-by-step format for complex problems
- Potential plagiarism indicators
- Lack of explanations

### Suggestions (Nice to Have)
- Use more formatting for readability
- Break down long sentences
- Add more detailed explanations

### Scoring System
- **80-100**: Excellent - Ready to submit
- **60-79**: Good - Minor improvements needed
- **40-59**: Fair - Several improvements required
- **0-39**: Poor - Major revisions needed

## Best Practices

### 1. **Always Use Step-by-Step Format**
For problems that require multiple steps, always break down your solution:
- Start with understanding/given information
- Show all intermediate steps
- Explain the reasoning
- Provide clear final answer

### 2. **Format Math Properly**
- Use LaTeX for all mathematical expressions
- Use inline math `\( \)` for equations within text
- Use display math `\[ \]` for important equations
- Format fractions, roots, and symbols correctly

### 3. **Provide Explanations**
- Don't just show steps, explain WHY
- Help students understand the concept
- Include tips or common mistakes to avoid

### 4. **Clear Final Answer**
- Always have a clearly marked final answer section
- Make it bold and prominent
- Include units if applicable

### 5. **Use Proper Formatting**
- Bold for emphasis on key terms
- Italic for variables and terminology
- Tables for organizing data
- Lists for multiple points

### 6. **Validate Before Submitting**
- Always run the validation check
- Fix all critical issues
- Address warnings when possible
- Consider suggestions for improvement

## Keyboard Shortcuts

- **Ctrl+B** - Bold
- **Ctrl+I** - Italic
- **Ctrl+U** - Underline

## Technical Details

### Supported Formats
- **Markdown** - Full markdown support
- **LaTeX Math** - Inline and display equations
- **HTML** - Basic HTML tags (sub, sup, u, etc.)
- **Tables** - Markdown and HTML tables
- **Code Blocks** - Syntax highlighted code

### Auto-Conversions
- Fractions: `a/b` → `\frac{a}{b}`
- Exponents: `x^2` → `x^{2}`
- Square roots: `sqrt(x)` → `\sqrt{x}`
- Inequalities: `<=` → `≤`, `>=` → `≥`, `!=` → `≠`
- Greek letters: `alpha` → `α`, `beta` → `β`, etc.

### Chemical Formulas
- Automatic subscript: `H2O` → H<sub>2</sub>O
- Arrow conversion: `->` → →, `<->` → ⇌
- Charge notation: `^2+` → <sup>2+</sup>

## Troubleshooting

### Toolbar Not Appearing
- Refresh the page
- Check that the extension is enabled
- Clear browser cache and reload

### Formatting Not Working
- Make sure text is selected (for some operations)
- Try using the auto-format button
- Check console for errors

### Validation Shows Errors
- Read the specific issues listed
- Follow the suggestions provided
- Re-validate after making changes

### Math Not Rendering
- Ensure LaTeX syntax is correct
- Use proper delimiters: `\( \)` or `\[ \]`
- Check for unmatched braces

## Version Information

**Version**: 3.0 (July 2025 Compatible)
**Last Updated**: 2025-11-13

## Support

For issues or questions:
1. Check this guide first
2. Review the validation feedback
3. Test with simple examples
4. Contact support if problem persists

---

## NEW TOOLS - Detailed Usage

### 🔧 Code Snippet Tool

Format code with syntax highlighting and line numbers:

**Usage:**
```python:linenos
def factorial(n):
    if n == 0:
        return 1
    return n * factorial(n-1)
```

The extension auto-detects code based on keywords like `def`, `function`, `class`, etc.

**Features:**
- Syntax highlighting for 50+ languages
- Optional line numbers (:linenos suffix)
- Auto-detection of programming languages
- Preserves indentation

---

### 🧪 Chemistry Equation Tool

Use the %% shortcut to create chemistry equations:

**Usage:**
```
%%H2 + O2 → H2O%%
%%2NaOH + H2SO4 → Na2SO4 + 2H2O%%
%%CH4 + 2O2 ⇌ CO2 + 2H2O%%
```

**Features:**
- Auto-detects chemical reactions with arrows (→, ←, ⇌)
- Supports reaction conditions
- Greek letters for equations
- Automatic subscript/superscript formatting

---

### 📐 Inline Equation Tool

Use the == shortcut for inline equations:

**Usage:**
```
The solution is ==x^2 + 5x + 6 = 0== which factors to ==(x+2)(x+3)==.
```

**Features:**
- Seamless integration within text
- Live preview
- Copy/paste support
- Same math expressions as Equation Renderer

---

### 🔢 Math in Text Tool

Create automatic calculations:

**3-Line Version:**
```
Area = πr²
= π × 5²
= 78.54 square units
```

**2-Line Version:**
```
5 × 3 + 2
= 17
```

The extension auto-detects calculation patterns and formats them appropriately.

---

### 📊 Accounting Tables

**Journal Entry Table:**
```
| Account | Debit | Credit |
|---------|-------|--------|
| Cash | 1000 | |
| Revenue | | 1000 |
| **Total** | **1000** | **1000** |
```

**T-Account Table:**
```
**Cash Account**

| Debit | | Credit |
|-------|:-:|--------|
| Opening: 500 | | Payment: 200 |
| Receipt: 300 | | |
| **Balance: 800** | | **Balance: 200** |
```

Auto-detected when text contains keywords like "debit", "credit", "journal entry", "t-account".

---

### 📈 Enhanced Table Tool

Create tables with advanced formatting:

**Features:**
- Cell alignment (left, center, right)
- Currency formatting (auto-adds $ and .00)
- Headers and gridlines
- Merge/unmerge cells
- Auto-sum calculations
- Decimal formatting

**Example:**
```
| Item | Quantity | Price | Total |
|:-----|:--------:|------:|------:|
| Widget A | 5 | $10.00 | $50.00 |
| Widget B | 3 | $15.50 | $46.50 |
| **Total** | **8** | | **$96.50** |
```

---

## Content Auto-Detection

The extension automatically detects content types and applies the appropriate tool:

| Content Type | Detection Pattern | Tool Applied |
|-------------|------------------|--------------|
| Code | `def`, `function`, `class`, `{}` | Code Snippet Tool |
| Chemistry | Chemical formulas, reaction arrows | Chemistry Equation Tool |
| Accounting | "debit", "credit", "journal" | Accounting Tables |
| Math | Equations, calculations, Greek letters | Inline Equation/Math in Text |
| Steps | "Step 1", "Step 2", numbered steps | Step-by-Step Format |
| Tables | Pipes `\|`, aligned columns | Table Tool |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+B** | Bold text |
| **Ctrl+I** | Italic text |
| **Ctrl+U** | Underline text |
| **==** + Enter | Insert inline equation |
| **%%** + Enter | Insert chemistry equation |
| **```** + language | Insert code block |

---

## Quick Reference Card

| Action | Toolbar Button | Shortcut | Result |
|--------|---------------|----------|--------|
| Bold | **B** | Ctrl+B | `**text**` |
| Italic | *I* | Ctrl+I | `*text*` |
| Code Snippet | </> | ``` | Formatted code |
| Inline Equation | == | == | `\(equation\)` |
| Chem Equation | %% | %% | `%%equation%%` |
| Math in Text | 1+2=3 | - | Auto-calc |
| Journal Entry | Dr/Cr | - | Accounting table |
| T-Account | T | - | T-account table |
| Enhanced Format | ✨ | - | All tools applied |
| Validate | ✓✓ | - | Quality check |

---

## Tips for Perfect Formatting

1. **Use Shortcuts** - Type `==` for math, `%%` for chemistry, ``` for code
2. **Let Auto-Detect Work** - The extension recognizes content types automatically
3. **Review Before Pasting** - Always check the formatted preview
4. **Validate Answers** - Click ✓✓ to check quality score before submitting
5. **Include Explanations** - Don't just show steps, explain WHY
6. **Use Appropriate Tools** - Code in code blocks, equations in math tools
7. **Format Tables Properly** - Use accounting tables for financial data
8. **Check Chemistry Arrows** - Use proper reaction arrows (→, ⇌, ⇒)

---

**Remember**: The goal is to help students learn, not just provide answers. Always include clear explanations and proper formatting to create the best educational experience!
