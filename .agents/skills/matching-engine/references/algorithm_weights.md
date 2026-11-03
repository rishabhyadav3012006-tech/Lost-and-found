# ⚖️ ReUnite AI Matching Algorithm Reference

## Overview
The matching engine in `backend/app/services/matching.py` computes an overall similarity score in the interval `[0.0, 1.0]` between a `missing` report and a `found` report.

## Factor Weights

| Factor | Weight | Evaluation Method | Handling of Missing / Unknown Values |
| :--- | :---: | :--- | :--- |
| **Age** | `0.25` | Min/Max interval overlap ratio with gap penalties | Returns neutral `0.5` |
| **Gender** | `0.20` | Strict equality check (`male`, `female`, `other`) | `"unknown"` returns neutral `0.5`, mismatch returns `0.0` |
| **Height** | `0.10` | Min/Max interval overlap ratio with gap penalties | Returns neutral `0.5` |
| **Hair Color** | `0.10` | Case-insensitive string match / substring containment | Returns neutral `0.5` |
| **Eye Color** | `0.10` | Case-insensitive string match / substring containment | Returns neutral `0.5` |
| **Clothing** | `0.10` | Word-level Jaccard token similarity | Returns neutral `0.5` |
| **Distinguishing Features** | `0.05` | Word-level Jaccard token similarity | Returns neutral `0.5` |
| **Skin Tone** | `0.05` | Case-insensitive string match / substring containment | Returns neutral `0.5` |
| **Build** | `0.05` | Case-insensitive string match / substring containment | Returns neutral `0.5` |
| **Total** | **`1.00`** | Weighted sum clamped between `0.0` and `1.0` | |

## Formulas

### 1. Age & Height Overlap
$$\text{Overlap} = \min(A_{\max}, B_{\max}) - \max(A_{\min}, B_{\min})$$

If $\text{Overlap} > 0$:
$$\text{Score} = \frac{\text{Overlap}}{\frac{\text{Span}_A + \text{Span}_B}{2}}$$

If $\text{Overlap} \le 0$:
$$\text{Gap} = \max(A_{\min}, B_{\min}) - \min(A_{\max}, B_{\max})$$
$$\text{Score} = \max\left(0.0, 1.0 - \frac{\text{Gap}}{20.0}\right)$$

### 2. Text Similarity (Jaccard)
For clothing descriptions and distinguishing features:
$$\text{Score} = \frac{|T_A \cap T_B|}{|T_A \cup T_B|}$$
Where $T_A$ and $T_B$ are sets of lowercased whitespace-delimited tokens.

## Suggested Score Thresholds
- **$\ge 0.75$**: High confidence match — automatically flags for human administrative review.
- **$0.55 - 0.74$**: Moderate similarity — listed under candidate matches.
- **$< 0.55$**: Low similarity — omitted from candidate feeds.
