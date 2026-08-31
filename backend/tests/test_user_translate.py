

def test_prompt_names_the_languages_and_pins_the_target():
    """It read "Translate from en to zh:" — the target appeared once, as a bare
    code. With a Japanese paragraph under a wrong source code, models answered
    in English (owner, 2026-08-31)."""
    from services.user_translate import _prompt

    p = _prompt("吾輩は猫である。", "ja", "zh")
    assert "Japanese" in p and "Chinese (Simplified)" in p
    assert p.count("Chinese (Simplified)") >= 2, "the target must be unmissable"
    assert "吾輩は猫である。" in p
    assert "from ja to zh" not in p


def test_prompt_falls_back_to_the_code_for_an_unmapped_language():
    from services.user_translate import _prompt

    p = _prompt("text", "en", "eo")
    assert "English" in p and "eo" in p
