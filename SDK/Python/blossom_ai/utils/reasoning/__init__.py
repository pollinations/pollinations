"""
Blossom AI - Reasoning Utilities
Prompt-based reasoning enhancement for models without native reasoning support.

Features:
- Basic reasoning enhancement
- Multi-step reasoning chains
- Self-correction loop
- Multi-model consensus
"""

from blossom_ai.utils.reasoning.reasoning import (
    ReasoningEnhancer,
    ReasoningChain,
    ReasoningLevel,
    ReasoningConfig,
    create_reasoning_enhancer,
    quick_enhance,
)

# Advanced features (optional import)
try:
    from blossom_ai.utils.reasoning.advanced import (
        SelfCorrectingEnhancer,
        CorrectionConfig,
        ConsensusReasoning,
        ConsensusStrategy,
        ConsensusConfig,
        create_self_correcting_enhancer,
        create_consensus_reasoning,
    )
    _ADVANCED_AVAILABLE = True
except ImportError:
    _ADVANCED_AVAILABLE = False

__all__ = [
    # Basic reasoning
    "ReasoningEnhancer",
    "ReasoningChain",
    "ReasoningLevel",
    "ReasoningConfig",
    "create_reasoning_enhancer",
    "quick_enhance",
]

# Add advanced features if available
if _ADVANCED_AVAILABLE:
    __all__.extend([
        "SelfCorrectingEnhancer",
        "CorrectionConfig",
        "ConsensusReasoning",
        "ConsensusStrategy",
        "ConsensusConfig",
        "create_self_correcting_enhancer",
        "create_consensus_reasoning",
    ])