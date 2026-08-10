"""
Data Normalisation & Thermal Compensation Module for Structural Health Monitoring
===================================================================================
Based on Chapter 12 of 'Structural Health Monitoring: A Machine Learning Perspective'
by Charles R. Farrar and Keith Worden (Wiley, 2013).

This module separates environmental variability (such as temperature fluctuations)
from structural response parameters (such as cable tension force T_avg or natural
frequencies f1, f2, f3).
"""

import numpy as np
from typing import Dict, List, Tuple, Optional


def fit_linear_thermal_model(temps: List[float], values: List[float]) -> Tuple[float, float, float]:
    """
    Fits a linear thermal regression model:  hat{y} = a * T + b
    Returns:
        a: slope coefficient
        b: intercept
        r2: R-squared score of the fit
    """
    valid_mask = [
        (t is not None and v is not None and np.isfinite(t) and np.isfinite(v))
        for t, v in zip(temps, values)
    ]
    t_clean = np.array([t for t, m in zip(temps, valid_mask) if m], dtype=float)
    v_clean = np.array([v for v, m in zip(values, valid_mask) if m], dtype=float)

    if len(t_clean) < 3 or np.all(t_clean == t_clean[0]):
        return 0.0, float(np.mean(v_clean)) if len(v_clean) else 0.0, 0.0

    a, b = np.polyfit(t_clean, v_clean, 1)
    
    # Calculate R-squared
    v_pred = a * t_clean + b
    ss_res = np.sum((v_clean - v_pred) ** 2)
    ss_tot = np.sum((v_clean - np.mean(v_clean)) ** 2)
    r2 = float(1 - (ss_res / ss_tot)) if ss_tot > 0 else 0.0

    return float(a), float(b), float(max(0.0, r2))


def compute_residuals_and_spc_limits(
    temps: List[float], values: List[float], sigma_multiplier: float = 3.0
) -> Dict:
    """
    Computes temperature-predicted values, residual errors (e_i = y_i - hat{y}_i),
    and Statistical Process Control (SPC) 3-sigma limits on the residuals.
    """
    a, b, r2 = fit_linear_thermal_model(temps, values)
    
    predicted = []
    residuals = []
    
    for t, v in zip(temps, values):
        if t is not None and v is not None and np.isfinite(t) and np.isfinite(v):
            pred = a * float(t) + b
            res = float(v) - pred
            predicted.append(round(pred, 3))
            residuals.append(round(res, 3))
        else:
            predicted.append(None)
            residuals.append(None)

    clean_res = [r for r in residuals if r is not None]
    if clean_res:
        mean_res = float(np.mean(clean_res))
        std_res = float(np.std(clean_res))
        ucl = mean_res + sigma_multiplier * std_res
        lcl = mean_res - sigma_multiplier * std_res
    else:
        mean_res, std_res, ucl, lcl = 0.0, 0.0, 0.0, 0.0

    outliers_count = sum(
        1 for r in clean_res if r > ucl or r < lcl
    )

    return {
        "slope": round(a, 4),
        "intercept": round(b, 4),
        "r2_score": round(r2, 4),
        "predicted": predicted,
        "residuals": residuals,
        "mean_residual": round(mean_res, 4),
        "std_residual": round(std_res, 4),
        "ucl_3sigma": round(ucl, 4),
        "lcl_3sigma": round(lcl, 4),
        "outliers_count": outliers_count,
    }
