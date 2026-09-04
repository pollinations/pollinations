#!/usr/bin/env python3
"""Tiny built-in i18n layer. Menus, dialogs, errors and advisor UI share it."""
from __future__ import annotations

import locale

SUPPORTED = ("en", "fr", "es", "de", "it", "zh")

EN = {
 "menu.connect":"Connect Account…", "menu.generate":"Generate Image…", "menu.generate_layer":"Generate as New Layer…",
 "menu.edit":"Edit with AI…", "menu.context":"Contextual Object…", "menu.separate":"Extract & Separate…",
 "menu.disconnect":"Disconnect", "menu.settings":"Pollinations AI Settings…",
 "button.cancel":"Cancel", "button.generate":"Generate", "button.apply":"Apply", "button.review":"Review with AI", "button.save":"Save",
 "label.model":"Model", "label.prompt":"Prompt", "label.resolution":"Resolution", "label.size":"Size", "label.seed":"Seed",
 "label.quality":"Quality", "label.transparent":"Transparent background", "label.destination":"Destination",
 "label.description":"Description", "label.operation":"Operation", "label.context":"Context padding", "label.language":"Language",
 "dest.image":"New image", "dest.layer":"New layer in current image",
 "edit.full":"Full layer edit", "edit.selection":"Selection patch", "op.add":"Add object", "op.replace":"Replace object", "op.remove":"Remove object",
 "settings.title":"Pollinations AI Settings", "settings.account":"Account", "settings.connected":"Connected", "settings.disconnected":"Not connected",
 "settings.gen_model":"Default generation model", "settings.edit_model":"Default edit model", "settings.advisor_model":"Advisor model",
 "settings.auto":"Auto — recommended", "settings.auto_recommend":"Auto-recommend models", "settings.review":"Review prompt with context by default",
 "settings.show_desc":"Show model descriptions", "settings.prefer_official":"Prefer official models", "settings.community":"Include Community Models",
 "settings.destination":"Default generation destination", "settings.preserve":"Preserve original content", "settings.group":"Group Extract & Separate outputs",
 "settings.restart":"Menu language changes after restarting GIMP.", "settings.first":"Welcome to Pollinations AI for GIMP. Choose your defaults; you can change them later.",
 "advisor.title":"AI review", "advisor.suggested":"Suggested", "advisor.reason":"Why", "advisor.warning":"Warning",
 "advisor.none":"No compatible vision + tools advisor model is available.", "advisor.failed":"Advisor review failed: {error}",
 "connect.title":"Connect Pollinations", "connect.explain":"Approve this GIMP plug-in in your browser. You never paste an API key into GIMP.",
 "connect.open":"Open Browser", "connect.wait":"Waiting for approval…", "connect.ok":"Connected. Your authorization is stored privately for future GIMP sessions.",
 "disconnect.ok":"Disconnected. The local Pollinations authorization was removed.", "disconnect.none":"Already disconnected.",
 "error.not_connected":"Not connected to Pollinations. Connect your account first.", "error.no_image":"Open an image and select a layer first.",
 "error.no_models":"No compatible image models are available to this account.", "error.empty_prompt":"Prompt cannot be empty.",
 "error.selection_required":"Create a selection around the target object or area first.",
 "context.help":"Uses the selection plus surrounding pixels so the model can place or remove an object coherently.",
 "separate.help":"Creates an extracted-object layer from your selection, an AI-cleaned background patch, and preserves an original reference.",
 "separate.group":"Pollinations Separation", "separate.object":"Extracted object", "separate.background":"Background fill", "separate.original":"Original reference",
 "model.community":"Community", "model.edit":"edit", "model.paid":"paid", "model.refs":"references: {count}", "model.cost":"~{cost} pollen/image",
 "progress.generate":"Generating with {model}…", "progress.edit":"Editing with {model}…", "progress.review":"Reviewing prompt with {model}…",
 "progress.separate":"Separating object with {model}…", "review.checkbox":"Review prompt with context",
 "review.applied":"Advisor suggestion applied.", "review.keep":"Suggestion shown; your current settings were kept.",
}

FR = {
 "menu.connect":"Connecter le compte…", "menu.generate":"Générer une image…", "menu.generate_layer":"Générer comme nouveau calque…",
 "menu.edit":"Éditer avec l’IA…", "menu.context":"Objet contextuel…", "menu.separate":"Extraire & séparer…",
 "menu.disconnect":"Déconnecter", "menu.settings":"Réglages Pollinations AI…",
 "button.cancel":"Annuler", "button.generate":"Générer", "button.apply":"Appliquer", "button.review":"Réviser avec l’IA", "button.save":"Enregistrer",
 "label.model":"Modèle", "label.prompt":"Prompt", "label.resolution":"Résolution", "label.size":"Taille", "label.seed":"Seed",
 "label.quality":"Qualité", "label.transparent":"Fond transparent", "label.destination":"Destination",
 "label.description":"Description", "label.operation":"Opération", "label.context":"Marge de contexte", "label.language":"Langue",
 "dest.image":"Nouvelle image", "dest.layer":"Nouveau calque dans l’image courante",
 "edit.full":"Édition du calque complet", "edit.selection":"Patch de sélection", "op.add":"Ajouter un objet", "op.replace":"Remplacer l’objet", "op.remove":"Supprimer l’objet",
 "settings.title":"Réglages Pollinations AI", "settings.account":"Compte", "settings.connected":"Connecté", "settings.disconnected":"Non connecté",
 "settings.gen_model":"Modèle de génération par défaut", "settings.edit_model":"Modèle d’édition par défaut", "settings.advisor_model":"Modèle conseiller",
 "settings.auto":"Auto — recommandé", "settings.auto_recommend":"Recommander automatiquement les modèles", "settings.review":"Réviser le prompt avec le contexte par défaut",
 "settings.show_desc":"Afficher les descriptions des modèles", "settings.prefer_official":"Préférer les modèles officiels", "settings.community":"Inclure les Community Models",
 "settings.destination":"Destination de génération par défaut", "settings.preserve":"Préserver le contenu original", "settings.group":"Grouper les sorties Extraire & séparer",
 "settings.restart":"La langue des menus change après redémarrage de GIMP.", "settings.first":"Bienvenue dans Pollinations AI pour GIMP. Choisissez vos réglages par défaut ; ils restent modifiables ensuite.",
 "advisor.title":"Révision IA", "advisor.suggested":"Suggestion", "advisor.reason":"Pourquoi", "advisor.warning":"Attention",
 "advisor.none":"Aucun modèle conseiller compatible vision + tools n’est disponible.", "advisor.failed":"Échec de la révision par le conseiller : {error}",
 "connect.title":"Connecter Pollinations", "connect.explain":"Autorisez ce plugin GIMP dans votre navigateur. Vous ne collez jamais de clé API dans GIMP.",
 "connect.open":"Ouvrir le navigateur", "connect.wait":"En attente de l’autorisation…", "connect.ok":"Connecté. Votre autorisation est stockée localement de façon privée pour les prochaines sessions GIMP.",
 "disconnect.ok":"Déconnecté. L’autorisation Pollinations locale a été supprimée.", "disconnect.none":"Déjà déconnecté.",
 "error.not_connected":"Non connecté à Pollinations. Connectez d’abord votre compte.", "error.no_image":"Ouvrez une image et sélectionnez d’abord un calque.",
 "error.no_models":"Aucun modèle image compatible n’est disponible pour ce compte.", "error.empty_prompt":"Le prompt ne peut pas être vide.",
 "error.selection_required":"Créez d’abord une sélection autour de l’objet ou de la zone cible.",
 "context.help":"Utilise la sélection et les pixels autour afin que le modèle place, remplace ou supprime l’objet de façon cohérente.",
 "separate.help":"Crée un calque de l’objet extrait depuis votre sélection, un patch de fond reconstruit par IA et conserve une référence originale.",
 "separate.group":"Séparation Pollinations", "separate.object":"Objet extrait", "separate.background":"Fond reconstruit", "separate.original":"Référence originale",
 "model.community":"Community", "model.edit":"édition", "model.paid":"payant", "model.refs":"références : {count}", "model.cost":"~{cost} pollen/image",
 "progress.generate":"Génération avec {model}…", "progress.edit":"Édition avec {model}…", "progress.review":"Révision du prompt avec {model}…",
 "progress.separate":"Séparation de l’objet avec {model}…", "review.checkbox":"Réviser le prompt avec le contexte",
 "review.applied":"Suggestion du conseiller appliquée.", "review.keep":"Suggestion affichée ; vos réglages actuels sont conservés.",
}

# Complete menu/action/settings coverage; uncommon explanatory keys fall back to English.
ES = {"menu.connect":"Conectar cuenta…","menu.generate":"Generar imagen…","menu.generate_layer":"Generar como nueva capa…","menu.edit":"Editar con IA…","menu.context":"Objeto contextual…","menu.separate":"Extraer y separar…","menu.disconnect":"Desconectar","menu.settings":"Ajustes de Pollinations AI…","button.cancel":"Cancelar","button.generate":"Generar","button.apply":"Aplicar","button.review":"Revisar con IA","button.save":"Guardar","label.model":"Modelo","label.prompt":"Prompt","label.resolution":"Resolución","label.size":"Tamaño","label.seed":"Semilla","label.quality":"Calidad","label.transparent":"Fondo transparente","label.destination":"Destino","label.operation":"Operación","label.context":"Margen de contexto","label.language":"Idioma","dest.image":"Nueva imagen","dest.layer":"Nueva capa en la imagen actual","edit.full":"Editar capa completa","edit.selection":"Parche de selección","op.add":"Añadir objeto","op.replace":"Reemplazar objeto","op.remove":"Eliminar objeto","settings.title":"Ajustes de Pollinations AI","settings.account":"Cuenta","settings.connected":"Conectado","settings.disconnected":"No conectado","settings.gen_model":"Modelo de generación predeterminado","settings.edit_model":"Modelo de edición predeterminado","settings.advisor_model":"Modelo asesor","settings.auto":"Auto — recomendado","settings.auto_recommend":"Recomendar modelos automáticamente","settings.review":"Revisar el prompt con contexto por defecto","review.checkbox":"Revisar el prompt con contexto"}
DE = {"menu.connect":"Konto verbinden…","menu.generate":"Bild erzeugen…","menu.generate_layer":"Als neue Ebene erzeugen…","menu.edit":"Mit KI bearbeiten…","menu.context":"Kontextobjekt…","menu.separate":"Extrahieren & trennen…","menu.disconnect":"Trennen","menu.settings":"Pollinations-AI-Einstellungen…","button.cancel":"Abbrechen","button.generate":"Erzeugen","button.apply":"Anwenden","button.review":"Mit KI prüfen","button.save":"Speichern","label.model":"Modell","label.prompt":"Prompt","label.resolution":"Auflösung","label.size":"Größe","label.seed":"Seed","label.quality":"Qualität","label.transparent":"Transparenter Hintergrund","label.destination":"Ziel","label.operation":"Operation","label.context":"Kontextrand","label.language":"Sprache","dest.image":"Neues Bild","dest.layer":"Neue Ebene im aktuellen Bild","edit.full":"Ganze Ebene bearbeiten","edit.selection":"Auswahl-Patch","op.add":"Objekt hinzufügen","op.replace":"Objekt ersetzen","op.remove":"Objekt entfernen","settings.title":"Pollinations-AI-Einstellungen","settings.account":"Konto","settings.connected":"Verbunden","settings.disconnected":"Nicht verbunden","settings.gen_model":"Standardmodell für Erzeugung","settings.edit_model":"Standardmodell für Bearbeitung","settings.advisor_model":"Beratermodell","settings.auto":"Auto — empfohlen","settings.auto_recommend":"Modelle automatisch empfehlen","settings.review":"Prompt standardmäßig mit Kontext prüfen","review.checkbox":"Prompt mit Kontext prüfen"}
IT = {"menu.connect":"Connetti account…","menu.generate":"Genera immagine…","menu.generate_layer":"Genera come nuovo livello…","menu.edit":"Modifica con IA…","menu.context":"Oggetto contestuale…","menu.separate":"Estrai e separa…","menu.disconnect":"Disconnetti","menu.settings":"Impostazioni Pollinations AI…","button.cancel":"Annulla","button.generate":"Genera","button.apply":"Applica","button.review":"Rivedi con IA","button.save":"Salva","label.model":"Modello","label.prompt":"Prompt","label.resolution":"Risoluzione","label.size":"Dimensione","label.seed":"Seed","label.quality":"Qualità","label.transparent":"Sfondo trasparente","label.destination":"Destinazione","label.operation":"Operazione","label.context":"Margine contesto","label.language":"Lingua","dest.image":"Nuova immagine","dest.layer":"Nuovo livello nell’immagine corrente","edit.full":"Modifica livello completo","edit.selection":"Patch selezione","op.add":"Aggiungi oggetto","op.replace":"Sostituisci oggetto","op.remove":"Rimuovi oggetto","settings.title":"Impostazioni Pollinations AI","settings.account":"Account","settings.connected":"Connesso","settings.disconnected":"Non connesso","settings.gen_model":"Modello generazione predefinito","settings.edit_model":"Modello modifica predefinito","settings.advisor_model":"Modello consulente","settings.auto":"Auto — consigliato","settings.auto_recommend":"Consiglia automaticamente i modelli","settings.review":"Rivedi il prompt con il contesto per impostazione predefinita","review.checkbox":"Rivedi il prompt con il contesto"}
ZH = {"menu.connect":"连接账户…","menu.generate":"生成图像…","menu.generate_layer":"生成到新图层…","menu.edit":"使用 AI 编辑…","menu.context":"上下文对象…","menu.separate":"提取并分离…","menu.disconnect":"断开连接","menu.settings":"Pollinations AI 设置…","button.cancel":"取消","button.generate":"生成","button.apply":"应用","button.review":"AI 审阅","button.save":"保存","label.model":"模型","label.prompt":"提示词","label.resolution":"分辨率","label.size":"尺寸","label.seed":"种子","label.quality":"质量","label.transparent":"透明背景","label.destination":"目标","label.operation":"操作","label.context":"上下文边距","label.language":"语言","dest.image":"新图像","dest.layer":"当前图像中的新图层","edit.full":"编辑完整图层","edit.selection":"选择区域补丁","op.add":"添加对象","op.replace":"替换对象","op.remove":"移除对象","settings.title":"Pollinations AI 设置","settings.account":"账户","settings.connected":"已连接","settings.disconnected":"未连接","settings.gen_model":"默认生成模型","settings.edit_model":"默认编辑模型","settings.advisor_model":"顾问模型","settings.auto":"自动 — 推荐","settings.auto_recommend":"自动推荐模型","settings.review":"默认结合上下文审阅提示词","review.checkbox":"结合上下文审阅提示词"}

DICTS = {"en": EN, "fr": FR, "es": ES, "de": DE, "it": IT, "zh": ZH}


def system_language() -> str:
    try:
        raw = locale.getlocale()[0] or ""
    except Exception:
        raw = ""
    code = raw.lower().split("_")[0].split("-")[0]
    return code if code in SUPPORTED else "en"


def resolve_language(configured: str | None) -> str:
    return system_language() if not configured or configured == "system" else configured if configured in SUPPORTED else "en"


def tr(key: str, lang: str = "en", **params) -> str:
    value = DICTS.get(lang, EN).get(key, EN.get(key, key))
    for name, replacement in params.items():
        value = value.replace("{" + name + "}", str(replacement))
    return value

# minimal++ additions: keep the six-language contract for every visible core action.
_EXTRA = {
"en": {
 "menu.isolate":"Isolate Object (RMBG)…", "welcome.title":"Welcome to Pollinations AI for GIMP", "welcome.subtitle":"Generate, edit and decompose images with live Pollinations models — directly as GIMP layers.",
 "welcome.privacy":"BYOP keeps your Pollinations authorization private. External RMBG is only used when you explicitly enable or run it.", "welcome.connect":"Connect Pollinations Account", "welcome.continue":"Continue to Settings",
 "settings.gen_fallback":"Generation fallback", "settings.edit_fallback":"Edit fallback", "settings.advisor_fallback":"Advisor fallback", "settings.fallback":"Enable resilient fallback", "settings.fallback_mode":"Fallback behavior",
 "settings.prefer_quest":"Prefer Quest models for Auto", "settings.health_window":"Health window", "settings.rmbg":"RMBG provider", "settings.rmbg_separation":"Use RMBG to finalize semantic separation", "settings.rmbg_quota":"ClearBackdrop quota: {remaining}/{limit} this hour",
 "fallback.ask":"The selected model failed or timed out. Try fallback {model}? A previous timed-out request may still have been billed.", "fallback.auto":"Automatic fallback: {model}",
 "health.on":"Healthy", "health.degraded":"Degraded", "health.off":"Offline", "health.unknown":"Health unknown", "model.quest":"Quest", "model.official":"Official", "model.token_priced":"token-priced", "model.latency":"p50 {seconds}s",
 "progress.preparing":"Preparing request…", "progress.sending":"Sending to {model}…", "progress.waiting":"Waiting for {model}…", "progress.received":"Response received. Preparing result…", "progress.rmbg":"Removing background…", "progress.background":"Reconstructing background…", "progress.object":"Separating target object…",
 "progress.note":"This request can keep running upstream even if the client times out; the plugin will not blindly resubmit paid work.",
 "isolate.help":"Cuts the selected subject into a transparent layer using the configured RMBG provider. The source layer stays untouched.",
 "separate.help":"Semantic separation: the edit model isolates the requested subject and reconstructs the scene without it; RMBG then creates a true transparent object layer.",
 "separate.target":"Object to separate", "rmbg.off":"Disabled", "rmbg.clearbackdrop":"ClearBackdrop — free 100/hour/IP", "fallback.off":"Off", "fallback.ask_mode":"Ask before fallback", "fallback.automatic":"Automatic",
 "error.524":"The model provider timed out upstream (HTTP 524).", "button.close":"Close"
},
"fr": {
 "menu.isolate":"Isoler l’objet (RMBG)…", "welcome.title":"Bienvenue dans Pollinations AI pour GIMP", "welcome.subtitle":"Générez, éditez et décomposez vos images avec les modèles Pollinations en direct — directement en calques GIMP.",
 "welcome.privacy":"Le BYOP conserve votre autorisation Pollinations privée. Le RMBG externe n’est utilisé que si vous l’activez ou lancez explicitement.", "welcome.connect":"Connecter mon compte Pollinations", "welcome.continue":"Continuer vers la configuration",
 "settings.gen_fallback":"Fallback génération", "settings.edit_fallback":"Fallback édition", "settings.advisor_fallback":"Fallback conseiller", "settings.fallback":"Activer le fallback résilient", "settings.fallback_mode":"Comportement du fallback",
 "settings.prefer_quest":"Préférer les modèles Quest en Auto", "settings.health_window":"Fenêtre de santé", "settings.rmbg":"Fournisseur RMBG", "settings.rmbg_separation":"Utiliser RMBG pour finaliser la séparation sémantique", "settings.rmbg_quota":"Quota ClearBackdrop : {remaining}/{limit} cette heure",
 "fallback.ask":"Le modèle sélectionné a échoué ou expiré. Essayer le fallback {model} ? Une requête expirée peut malgré tout avoir été facturée.", "fallback.auto":"Fallback automatique : {model}",
 "health.on":"Sain", "health.degraded":"Dégradé", "health.off":"Hors service", "health.unknown":"Santé inconnue", "model.quest":"Quest", "model.official":"Officiel", "model.token_priced":"tarification tokens", "model.latency":"p50 {seconds}s",
 "progress.preparing":"Préparation de la requête…", "progress.sending":"Envoi vers {model}…", "progress.waiting":"Attente de {model}…", "progress.received":"Réponse reçue. Préparation du résultat…", "progress.rmbg":"Détourage du fond…", "progress.background":"Reconstruction du fond…", "progress.object":"Séparation sémantique de l’objet…",
 "progress.note":"La requête peut continuer côté fournisseur après un timeout client ; le plugin ne resoumet jamais aveuglément un travail potentiellement facturé.",
 "isolate.help":"Détoure le sujet sélectionné dans un calque transparent via le fournisseur RMBG configuré. Le calque source reste intact.",
 "separate.help":"Séparation sémantique : le modèle d’édition isole le sujet demandé et reconstruit la scène sans lui ; RMBG produit ensuite un vrai calque transparent.",
 "separate.target":"Objet à séparer", "rmbg.off":"Désactivé", "rmbg.clearbackdrop":"ClearBackdrop — gratuit 100/heure/IP", "fallback.off":"Désactivé", "fallback.ask_mode":"Demander avant fallback", "fallback.automatic":"Automatique",
 "error.524":"Le fournisseur du modèle a expiré côté amont (HTTP 524).", "button.close":"Fermer"
},
"es": {
 "menu.isolate":"Aislar objeto (RMBG)…", "welcome.title":"Bienvenido a Pollinations AI para GIMP", "welcome.subtitle":"Genera, edita y separa imágenes con modelos Pollinations en capas GIMP.", "welcome.privacy":"BYOP mantiene privada tu autorización. RMBG externo solo se usa cuando lo activas.", "welcome.connect":"Conectar cuenta Pollinations", "welcome.continue":"Continuar a ajustes", "settings.gen_fallback":"Fallback de generación", "settings.edit_fallback":"Fallback de edición", "settings.advisor_fallback":"Fallback del asesor", "settings.fallback":"Activar fallback resiliente", "settings.fallback_mode":"Comportamiento del fallback", "settings.prefer_quest":"Preferir modelos Quest en Auto", "settings.rmbg":"Proveedor RMBG", "settings.rmbg_separation":"Usar RMBG en separación semántica", "health.on":"Saludable", "health.degraded":"Degradado", "health.off":"Fuera de servicio", "model.quest":"Quest", "model.official":"Oficial", "progress.preparing":"Preparando solicitud…", "progress.sending":"Enviando a {model}…", "progress.waiting":"Esperando a {model}…", "progress.rmbg":"Eliminando fondo…", "progress.background":"Reconstruyendo fondo…", "progress.object":"Separando objeto…", "isolate.help":"Aísla el sujeto en una capa transparente con RMBG.", "separate.target":"Objeto a separar", "rmbg.off":"Desactivado", "rmbg.clearbackdrop":"ClearBackdrop — gratis 100/hora/IP", "fallback.off":"Desactivado", "fallback.ask_mode":"Preguntar antes", "fallback.automatic":"Automático"
},
"de": {
 "menu.isolate":"Objekt isolieren (RMBG)…", "welcome.title":"Willkommen bei Pollinations AI für GIMP", "welcome.subtitle":"Bilder mit Pollinations-Modellen direkt als GIMP-Ebenen erzeugen, bearbeiten und trennen.", "welcome.privacy":"BYOP hält die Autorisierung privat. Externes RMBG wird nur nach Aktivierung verwendet.", "welcome.connect":"Pollinations-Konto verbinden", "welcome.continue":"Zu Einstellungen", "settings.gen_fallback":"Fallback Erzeugung", "settings.edit_fallback":"Fallback Bearbeitung", "settings.advisor_fallback":"Fallback Berater", "settings.fallback":"Resilienten Fallback aktivieren", "settings.fallback_mode":"Fallback-Verhalten", "settings.prefer_quest":"Quest-Modelle in Auto bevorzugen", "settings.rmbg":"RMBG-Anbieter", "settings.rmbg_separation":"RMBG für semantische Trennung nutzen", "health.on":"Gesund", "health.degraded":"Beeinträchtigt", "health.off":"Offline", "model.quest":"Quest", "model.official":"Offiziell", "progress.preparing":"Anfrage vorbereiten…", "progress.sending":"Sende an {model}…", "progress.waiting":"Warte auf {model}…", "progress.rmbg":"Hintergrund entfernen…", "progress.background":"Hintergrund rekonstruieren…", "progress.object":"Objekt trennen…", "isolate.help":"Isoliert das Motiv per RMBG in einer transparenten Ebene.", "separate.target":"Zu trennendes Objekt", "rmbg.off":"Deaktiviert", "rmbg.clearbackdrop":"ClearBackdrop — kostenlos 100/Stunde/IP", "fallback.off":"Aus", "fallback.ask_mode":"Vor Fallback fragen", "fallback.automatic":"Automatisch"
},
"it": {
 "menu.isolate":"Isola oggetto (RMBG)…", "welcome.title":"Benvenuto in Pollinations AI per GIMP", "welcome.subtitle":"Genera, modifica e separa immagini con i modelli Pollinations direttamente nei livelli GIMP.", "welcome.privacy":"BYOP mantiene privata l’autorizzazione. RMBG esterno si usa solo quando attivato.", "welcome.connect":"Connetti account Pollinations", "welcome.continue":"Continua alle impostazioni", "settings.gen_fallback":"Fallback generazione", "settings.edit_fallback":"Fallback modifica", "settings.advisor_fallback":"Fallback consulente", "settings.fallback":"Abilita fallback resiliente", "settings.fallback_mode":"Comportamento fallback", "settings.prefer_quest":"Preferisci modelli Quest in Auto", "settings.rmbg":"Provider RMBG", "settings.rmbg_separation":"Usa RMBG nella separazione semantica", "health.on":"Sano", "health.degraded":"Degradato", "health.off":"Offline", "model.quest":"Quest", "model.official":"Ufficiale", "progress.preparing":"Preparazione richiesta…", "progress.sending":"Invio a {model}…", "progress.waiting":"Attesa di {model}…", "progress.rmbg":"Rimozione sfondo…", "progress.background":"Ricostruzione sfondo…", "progress.object":"Separazione oggetto…", "isolate.help":"Isola il soggetto in un livello trasparente tramite RMBG.", "separate.target":"Oggetto da separare", "rmbg.off":"Disabilitato", "rmbg.clearbackdrop":"ClearBackdrop — gratis 100/ora/IP", "fallback.off":"Disattivato", "fallback.ask_mode":"Chiedi prima del fallback", "fallback.automatic":"Automatico"
},
"zh": {
 "menu.isolate":"隔离对象 (RMBG)…", "welcome.title":"欢迎使用 GIMP Pollinations AI", "welcome.subtitle":"使用实时 Pollinations 模型直接在 GIMP 图层中生成、编辑和分离图像。", "welcome.privacy":"BYOP 保持授权私密；只有启用时才使用外部 RMBG。", "welcome.connect":"连接 Pollinations 账户", "welcome.continue":"继续到设置", "settings.gen_fallback":"生成备用模型", "settings.edit_fallback":"编辑备用模型", "settings.advisor_fallback":"顾问备用模型", "settings.fallback":"启用弹性备用", "settings.fallback_mode":"备用行为", "settings.prefer_quest":"自动模式优先 Quest 模型", "settings.rmbg":"RMBG 提供商", "settings.rmbg_separation":"语义分离后使用 RMBG", "health.on":"健康", "health.degraded":"降级", "health.off":"离线", "model.quest":"Quest", "model.official":"官方", "progress.preparing":"准备请求…", "progress.sending":"发送到 {model}…", "progress.waiting":"等待 {model}…", "progress.rmbg":"移除背景…", "progress.background":"重建背景…", "progress.object":"分离对象…", "isolate.help":"使用 RMBG 将主体隔离到透明图层。", "separate.target":"要分离的对象", "rmbg.off":"禁用", "rmbg.clearbackdrop":"ClearBackdrop — 免费 100次/小时/IP", "fallback.off":"关闭", "fallback.ask_mode":"备用前询问", "fallback.automatic":"自动"
}}
for _lang, _values in _EXTRA.items():
    DICTS[_lang].update(_values)

_UI_EXTRA = {
'en': {'tab.models':'Models','tab.behavior':'Behavior','tab.rmbg':'RMBG','tab.language':'Language','label.aspect':'Aspect ratio','label.fallback':'Fallback','size.source':'Source image','size.custom':'Custom'},
'fr': {'tab.models':'Modèles','tab.behavior':'Comportement','tab.rmbg':'RMBG','tab.language':'Langue','label.aspect':'Format / ratio','label.fallback':'Fallback','size.source':'Image source','size.custom':'Personnalisé'},
'es': {'tab.models':'Modelos','tab.behavior':'Comportamiento','tab.rmbg':'RMBG','tab.language':'Idioma','label.aspect':'Relación de aspecto','label.fallback':'Fallback','size.source':'Imagen fuente','size.custom':'Personalizado'},
'de': {'tab.models':'Modelle','tab.behavior':'Verhalten','tab.rmbg':'RMBG','tab.language':'Sprache','label.aspect':'Seitenverhältnis','label.fallback':'Fallback','size.source':'Quellbild','size.custom':'Benutzerdefiniert'},
'it': {'tab.models':'Modelli','tab.behavior':'Comportamento','tab.rmbg':'RMBG','tab.language':'Lingua','label.aspect':'Rapporto','label.fallback':'Fallback','size.source':'Immagine sorgente','size.custom':'Personalizzato'},
'zh': {'tab.models':'模型','tab.behavior':'行为','tab.rmbg':'RMBG','tab.language':'语言','label.aspect':'宽高比','label.fallback':'备用模型','size.source':'源图像','size.custom':'自定义'}
}
for _lang, _values in _UI_EXTRA.items(): DICTS[_lang].update(_values)

_RMBG_PROVIDER_EXTRA = {
'en': {
 'rmbg.auto':'Auto — BackgroundCut if configured, ClearBackdrop fallback',
 'rmbg.backgroundcut':'BackgroundCut — optional API key / higher quality',
 'rmbg.backgroundcut_key':'BackgroundCut API key', 'rmbg.key_optional':'Optional — leave empty to use ClearBackdrop',
 'rmbg.key_configured':'Key configured — leave empty to keep it', 'rmbg.key_clear':'Remove saved BackgroundCut key',
 'rmbg.quality':'BackgroundCut quality', 'rmbg.free_fallback':'Fallback to ClearBackdrop on BackgroundCut failure',
 'rmbg.auto_help':'Auto uses BackgroundCut when a key is configured; otherwise it uses ClearBackdrop. ClearBackdrop is documented, no-key and currently offers 100 free requests/hour/IP.',
 'rmbg.quota_unavailable':'ClearBackdrop quota unavailable', 'rmbg.key_missing':'BackgroundCut is selected but no API key is configured.',
 'progress.rmbg_backgroundcut':'Removing background with BackgroundCut…', 'progress.rmbg_clearbackdrop':'Removing background with ClearBackdrop…',
 'progress.rmbg_fallback':'BackgroundCut unavailable — falling back to ClearBackdrop…'
},
'fr': {
 'rmbg.auto':'Auto — BackgroundCut si configuré, fallback ClearBackdrop',
 'rmbg.backgroundcut':'BackgroundCut — clé API optionnelle / qualité supérieure',
 'rmbg.backgroundcut_key':'Clé API BackgroundCut', 'rmbg.key_optional':'Optionnelle — laissez vide pour utiliser ClearBackdrop',
 'rmbg.key_configured':'Clé configurée — laissez vide pour la conserver', 'rmbg.key_clear':'Supprimer la clé BackgroundCut enregistrée',
 'rmbg.quality':'Qualité BackgroundCut', 'rmbg.free_fallback':'Fallback vers ClearBackdrop si BackgroundCut échoue',
 'rmbg.auto_help':'Auto utilise BackgroundCut lorsqu’une clé est configurée, sinon ClearBackdrop. ClearBackdrop est documenté, sans clé et offre actuellement 100 requêtes gratuites/heure/IP.',
 'rmbg.quota_unavailable':'Quota ClearBackdrop indisponible', 'rmbg.key_missing':'BackgroundCut est sélectionné mais aucune clé API n’est configurée.',
 'progress.rmbg_backgroundcut':'Détourage via BackgroundCut…', 'progress.rmbg_clearbackdrop':'Détourage via ClearBackdrop…',
 'progress.rmbg_fallback':'BackgroundCut indisponible — fallback vers ClearBackdrop…'
},
'es': {
 'rmbg.auto':'Auto — BackgroundCut si está configurado, respaldo ClearBackdrop', 'rmbg.backgroundcut':'BackgroundCut — clave API opcional / mayor calidad',
 'rmbg.backgroundcut_key':'Clave API BackgroundCut','rmbg.key_optional':'Opcional — vacío usa ClearBackdrop','rmbg.key_configured':'Clave configurada — vacío la conserva','rmbg.key_clear':'Eliminar clave BackgroundCut guardada','rmbg.quality':'Calidad BackgroundCut','rmbg.free_fallback':'Usar ClearBackdrop si falla BackgroundCut','rmbg.auto_help':'Auto usa BackgroundCut con una clave configurada; si no, ClearBackdrop sin clave (100 solicitudes gratis/hora/IP actualmente).','rmbg.quota_unavailable':'Cuota ClearBackdrop no disponible','rmbg.key_missing':'BackgroundCut está seleccionado pero no hay clave API.','progress.rmbg_backgroundcut':'Eliminando fondo con BackgroundCut…','progress.rmbg_clearbackdrop':'Eliminando fondo con ClearBackdrop…','progress.rmbg_fallback':'BackgroundCut no disponible — usando ClearBackdrop…'
},
'de': {
 'rmbg.auto':'Auto — BackgroundCut wenn konfiguriert, ClearBackdrop-Fallback','rmbg.backgroundcut':'BackgroundCut — optionaler API-Schlüssel / höhere Qualität','rmbg.backgroundcut_key':'BackgroundCut API-Schlüssel','rmbg.key_optional':'Optional — leer nutzt ClearBackdrop','rmbg.key_configured':'Schlüssel konfiguriert — leer zum Behalten','rmbg.key_clear':'Gespeicherten BackgroundCut-Schlüssel entfernen','rmbg.quality':'BackgroundCut-Qualität','rmbg.free_fallback':'Bei BackgroundCut-Fehler auf ClearBackdrop zurückfallen','rmbg.auto_help':'Auto nutzt BackgroundCut mit konfiguriertem Schlüssel, sonst ClearBackdrop ohne Schlüssel (aktuell 100 kostenlose Anfragen/Stunde/IP).','rmbg.quota_unavailable':'ClearBackdrop-Kontingent nicht verfügbar','rmbg.key_missing':'BackgroundCut ist gewählt, aber kein API-Schlüssel ist konfiguriert.','progress.rmbg_backgroundcut':'Hintergrundentfernung mit BackgroundCut…','progress.rmbg_clearbackdrop':'Hintergrundentfernung mit ClearBackdrop…','progress.rmbg_fallback':'BackgroundCut nicht verfügbar — ClearBackdrop-Fallback…'
},
'it': {
 'rmbg.auto':'Auto — BackgroundCut se configurato, fallback ClearBackdrop','rmbg.backgroundcut':'BackgroundCut — chiave API opzionale / qualità superiore','rmbg.backgroundcut_key':'Chiave API BackgroundCut','rmbg.key_optional':'Opzionale — vuoto usa ClearBackdrop','rmbg.key_configured':'Chiave configurata — vuoto per conservarla','rmbg.key_clear':'Rimuovi chiave BackgroundCut salvata','rmbg.quality':'Qualità BackgroundCut','rmbg.free_fallback':'Fallback a ClearBackdrop se BackgroundCut fallisce','rmbg.auto_help':'Auto usa BackgroundCut quando è configurata una chiave, altrimenti ClearBackdrop senza chiave (attualmente 100 richieste gratuite/ora/IP).','rmbg.quota_unavailable':'Quota ClearBackdrop non disponibile','rmbg.key_missing':'BackgroundCut è selezionato ma non è configurata alcuna chiave API.','progress.rmbg_backgroundcut':'Rimozione sfondo con BackgroundCut…','progress.rmbg_clearbackdrop':'Rimozione sfondo con ClearBackdrop…','progress.rmbg_fallback':'BackgroundCut non disponibile — fallback ClearBackdrop…'
},
'zh': {
 'rmbg.auto':'自动 — 已配置时使用 BackgroundCut，否则回退 ClearBackdrop','rmbg.backgroundcut':'BackgroundCut — 可选 API 密钥 / 更高质量','rmbg.backgroundcut_key':'BackgroundCut API 密钥','rmbg.key_optional':'可选 — 留空使用 ClearBackdrop','rmbg.key_configured':'已配置密钥 — 留空以保留','rmbg.key_clear':'删除已保存的 BackgroundCut 密钥','rmbg.quality':'BackgroundCut 质量','rmbg.free_fallback':'BackgroundCut 失败时回退 ClearBackdrop','rmbg.auto_help':'自动模式在配置密钥时使用 BackgroundCut，否则使用无需密钥的 ClearBackdrop（当前每 IP 每小时 100 次免费请求）。','rmbg.quota_unavailable':'ClearBackdrop 配额不可用','rmbg.key_missing':'已选择 BackgroundCut，但未配置 API 密钥。','progress.rmbg_backgroundcut':'正在使用 BackgroundCut 移除背景…','progress.rmbg_clearbackdrop':'正在使用 ClearBackdrop 移除背景…','progress.rmbg_fallback':'BackgroundCut 不可用 — 回退 ClearBackdrop…'
}}
for _lang, _values in _RMBG_PROVIDER_EXTRA.items(): DICTS[_lang].update(_values)

_FULL_PLUS_UI = {
'en': {
 'model.generate':'gen','model.vision_tools':'vision + tools','model.reasoning':'reasoning',
 'welcome.steps':'1  Connect  →  2  Configure  →  3  Create',
 'welcome.card_generate':'Generate','welcome.card_generate_text':'Create images with live Pollinations models, health-aware Auto selection and non-square formats.',
 'welcome.card_edit':'Edit in context','welcome.card_edit_text':'Edit layers and selections non-destructively, add/replace/remove objects and preserve spatial placement.',
 'welcome.card_separate':'Separate & isolate','welcome.card_separate_text':'Decompose a subject and rebuild its background, or create a transparent RMBG layer in one action.',
 'welcome.capabilities':'Live catalog • Official + Community • Quest/Paid awareness • Health fallbacks • Vision Advisor • Multilingual UI • Non-destructive GIMP layers',
 'settings.live_auto':'Live Auto recommendations right now','settings.live_note':'Auto is recalculated from the live catalog, capabilities and Pollinations model health whenever the plug-in opens an authenticated workflow.',
 'settings.auto_detail':'Current Auto choice','settings.no_model':'No compatible model is currently available.','settings.role_generation':'Generation','settings.role_edit':'Editing & contextual operations','settings.role_advisor':'Vision Advisor',
 'settings.manual_auto_fallback':'Allow silent automatic fallback after a manually selected model fails',
 'progress.elapsed':'Elapsed: {seconds}s'
},
'fr': {
 'model.generate':'génération','model.vision_tools':'vision + tools','model.reasoning':'raisonnement',
 'welcome.steps':'1  Connexion  →  2  Configuration  →  3  Création',
 'welcome.card_generate':'Générer','welcome.card_generate_text':'Créez des images avec les modèles Pollinations live, un Auto sensible à la santé et des formats non carrés.',
 'welcome.card_edit':'Éditer en contexte','welcome.card_edit_text':'Éditez calques et sélections sans destruction, ajoutez/remplacez/supprimez des objets et conservez leur placement.',
 'welcome.card_separate':'Séparer & isoler','welcome.card_separate_text':'Décomposez un sujet et reconstruisez son fond, ou créez directement un calque RMBG transparent.',
 'welcome.capabilities':'Catalogue live • Officiels + Community • Quest/Paid • Fallbacks santé • Conseiller vision • UI multilingue • Calques GIMP non destructifs',
 'settings.live_auto':'Recommandations Auto live maintenant','settings.live_note':'Auto est recalculé depuis le catalogue live, les capacités et la santé Pollinations à chaque ouverture d’un workflow authentifié.',
 'settings.auto_detail':'Choix Auto actuel','settings.no_model':'Aucun modèle compatible n’est disponible actuellement.','settings.role_generation':'Génération','settings.role_edit':'Édition & opérations contextuelles','settings.role_advisor':'Conseiller Vision',
 'settings.manual_auto_fallback':'Autoriser un fallback automatique silencieux après l’échec d’un modèle choisi manuellement',
 'progress.elapsed':'Temps écoulé : {seconds}s'
},
'es': {
 'model.generate':'gen','model.vision_tools':'visión + tools','model.reasoning':'razonamiento','welcome.steps':'1  Conectar  →  2  Configurar  →  3  Crear','welcome.card_generate':'Generar','welcome.card_generate_text':'Genera imágenes con modelos Pollinations en vivo, Auto según salud y formatos no cuadrados.','welcome.card_edit':'Editar en contexto','welcome.card_edit_text':'Edita capas y selecciones sin destruir, añade/reemplaza/elimina objetos y conserva la posición.','welcome.card_separate':'Separar y aislar','welcome.card_separate_text':'Separa un sujeto y reconstruye el fondo, o crea una capa RMBG transparente.','welcome.capabilities':'Catálogo live • Oficial + Community • Quest/Paid • Fallback por salud • Asesor visión • UI multilingüe • Capas no destructivas','settings.live_auto':'Recomendaciones Auto en vivo','settings.live_note':'Auto se recalcula desde catálogo, capacidades y salud de Pollinations al abrir un flujo autenticado.','settings.auto_detail':'Elección Auto actual','settings.no_model':'No hay modelo compatible disponible.','settings.role_generation':'Generación','settings.role_edit':'Edición y contexto','settings.role_advisor':'Asesor visual','settings.manual_auto_fallback':'Permitir fallback automático silencioso tras fallar un modelo elegido manualmente','progress.elapsed':'Tiempo: {seconds}s'
},
'de': {
 'model.generate':'Gen','model.vision_tools':'Vision + Tools','model.reasoning':'Reasoning','welcome.steps':'1  Verbinden  →  2  Konfigurieren  →  3  Erstellen','welcome.card_generate':'Erzeugen','welcome.card_generate_text':'Bilder mit Live-Pollinations-Modellen, Health-aware Auto und nicht-quadratischen Formaten erzeugen.','welcome.card_edit':'Im Kontext bearbeiten','welcome.card_edit_text':'Ebenen und Auswahl nicht-destruktiv bearbeiten, Objekte hinzufügen/ersetzen/entfernen und Position erhalten.','welcome.card_separate':'Trennen & isolieren','welcome.card_separate_text':'Motiv semantisch trennen und Hintergrund rekonstruieren oder transparente RMBG-Ebene erstellen.','welcome.capabilities':'Live-Katalog • Official + Community • Quest/Paid • Health-Fallback • Vision Advisor • Mehrsprachig • Nicht-destruktive Ebenen','settings.live_auto':'Aktuelle Live-Auto-Empfehlungen','settings.live_note':'Auto wird aus Live-Katalog, Fähigkeiten und Pollinations-Health bei jedem authentifizierten Workflow neu berechnet.','settings.auto_detail':'Aktuelle Auto-Wahl','settings.no_model':'Kein kompatibles Modell verfügbar.','settings.role_generation':'Erzeugung','settings.role_edit':'Bearbeitung & Kontext','settings.role_advisor':'Vision Advisor','settings.manual_auto_fallback':'Stillen automatischen Fallback nach manuell gewähltem Modell erlauben','progress.elapsed':'Vergangen: {seconds}s'
},
'it': {
 'model.generate':'gen','model.vision_tools':'visione + tool','model.reasoning':'ragionamento','welcome.steps':'1  Connetti  →  2  Configura  →  3  Crea','welcome.card_generate':'Genera','welcome.card_generate_text':'Genera immagini con modelli Pollinations live, Auto basato sulla salute e formati non quadrati.','welcome.card_edit':'Modifica nel contesto','welcome.card_edit_text':'Modifica livelli e selezioni senza distruzione, aggiungi/sostituisci/rimuovi oggetti mantenendo la posizione.','welcome.card_separate':'Separa e isola','welcome.card_separate_text':'Separa semanticamente il soggetto e ricostruisci lo sfondo, oppure crea un livello RMBG trasparente.','welcome.capabilities':'Catalogo live • Official + Community • Quest/Paid • Fallback salute • Advisor visivo • UI multilingue • Livelli non distruttivi','settings.live_auto':'Raccomandazioni Auto live','settings.live_note':'Auto viene ricalcolato da catalogo, capacità e salute Pollinations a ogni workflow autenticato.','settings.auto_detail':'Scelta Auto attuale','settings.no_model':'Nessun modello compatibile disponibile.','settings.role_generation':'Generazione','settings.role_edit':'Modifica e contesto','settings.role_advisor':'Advisor visivo','settings.manual_auto_fallback':'Consenti fallback automatico silenzioso dopo il fallimento di un modello scelto manualmente','progress.elapsed':'Tempo: {seconds}s'
},
'zh': {
 'model.generate':'生成','model.vision_tools':'视觉 + 工具','model.reasoning':'推理','welcome.steps':'1  连接  →  2  配置  →  3  创作','welcome.card_generate':'生成','welcome.card_generate_text':'使用实时 Pollinations 模型、健康感知自动选择和非方形尺寸生成图像。','welcome.card_edit':'上下文编辑','welcome.card_edit_text':'无损编辑图层和选区，添加/替换/移除对象并保持空间位置。','welcome.card_separate':'分离与隔离','welcome.card_separate_text':'语义分离主体并重建背景，或一键创建透明 RMBG 图层。','welcome.capabilities':'实时目录 • 官方 + Community • Quest/Paid • 健康回退 • 视觉顾问 • 多语言 • 无损 GIMP 图层','settings.live_auto':'当前实时 Auto 推荐','settings.live_note':'每次打开已认证工作流时，Auto 都会根据实时目录、能力和 Pollinations 健康状态重新计算。','settings.auto_detail':'当前 Auto 选择','settings.no_model':'当前没有兼容模型。','settings.role_generation':'生成','settings.role_edit':'编辑与上下文','settings.role_advisor':'视觉顾问','settings.manual_auto_fallback':'手动选择的模型失败后允许静默自动回退','progress.elapsed':'已用时间：{seconds}s'
}}
for _lang, _values in _FULL_PLUS_UI.items(): DICTS[_lang].update(_values)

_REFRESH_UI = {
'en': {'settings.refresh':'Refresh live models & health'},
'fr': {'settings.refresh':'Actualiser modèles & santé live'},
'es': {'settings.refresh':'Actualizar modelos y salud'},
'de': {'settings.refresh':'Modelle & Health aktualisieren'},
'it': {'settings.refresh':'Aggiorna modelli e salute'},
'zh': {'settings.refresh':'刷新模型与健康状态'},
}
for _lang, _values in _REFRESH_UI.items(): DICTS[_lang].update(_values)

_FLOW_PROGRESS_UI = {
'en': {
 'connect.approved':'Authorization approved. Preparing GIMP…','connect.failed':'Authorization failed.',
 'progress.configuration':'Preparing Pollinations AI…','progress.catalog_images':'Loading live image models…','progress.catalog_advisor':'Loading Vision Advisor models…','progress.catalog_health':'Checking live model health and latency…','progress.configuration_ready':'Configuration ready. Opening Settings…','progress.configuration_note':'The plug-in is building your live configuration from the current Pollinations catalog, capabilities and health. Nothing is hard-coded here.'
},
'fr': {
 'connect.approved':'Autorisation validée. Préparation de GIMP…','connect.failed':'Échec de l’autorisation.',
 'progress.configuration':'Configuration de Pollinations AI en cours…','progress.catalog_images':'Chargement des modèles image live…','progress.catalog_advisor':'Chargement des modèles Conseiller Vision…','progress.catalog_health':'Vérification de la santé et des latences live…','progress.configuration_ready':'Configuration prête. Ouverture des réglages…','progress.configuration_note':'Le plugin construit votre configuration live depuis le catalogue Pollinations actuel, ses capacités et sa santé. Rien n’est figé ici.'
},
'es': {'connect.approved':'Autorización aprobada. Preparando GIMP…','connect.failed':'Falló la autorización.','progress.configuration':'Preparando Pollinations AI…','progress.catalog_images':'Cargando modelos de imagen en vivo…','progress.catalog_advisor':'Cargando modelos del asesor visual…','progress.catalog_health':'Comprobando salud y latencia…','progress.configuration_ready':'Configuración lista. Abriendo ajustes…','progress.configuration_note':'El plugin crea la configuración en vivo desde el catálogo, capacidades y salud actuales de Pollinations.'},
'de': {'connect.approved':'Autorisierung bestätigt. GIMP wird vorbereitet…','connect.failed':'Autorisierung fehlgeschlagen.','progress.configuration':'Pollinations AI wird vorbereitet…','progress.catalog_images':'Live-Bildmodelle laden…','progress.catalog_advisor':'Vision-Advisor-Modelle laden…','progress.catalog_health':'Health und Latenzen prüfen…','progress.configuration_ready':'Konfiguration bereit. Einstellungen öffnen…','progress.configuration_note':'Das Plug-in erstellt die Live-Konfiguration aus aktuellem Pollinations-Katalog, Fähigkeiten und Health.'},
'it': {'connect.approved':'Autorizzazione approvata. Preparazione di GIMP…','connect.failed':'Autorizzazione fallita.','progress.configuration':'Preparazione Pollinations AI…','progress.catalog_images':'Caricamento modelli immagine live…','progress.catalog_advisor':'Caricamento modelli Advisor visivo…','progress.catalog_health':'Verifica salute e latenza…','progress.configuration_ready':'Configurazione pronta. Apertura impostazioni…','progress.configuration_note':'Il plugin costruisce la configurazione live dal catalogo Pollinations, capacità e stato attuali.'},
'zh': {'connect.approved':'授权已批准。正在准备 GIMP…','connect.failed':'授权失败。','progress.configuration':'正在准备 Pollinations AI…','progress.catalog_images':'正在加载实时图像模型…','progress.catalog_advisor':'正在加载视觉顾问模型…','progress.catalog_health':'正在检查模型健康与延迟…','progress.configuration_ready':'配置完成。正在打开设置…','progress.configuration_note':'插件会根据当前 Pollinations 实时目录、能力和健康状态构建配置，而不是使用固定模型。'}
}
for _lang, _values in _FLOW_PROGRESS_UI.items(): DICTS[_lang].update(_values)

_PARALLEL_CONFIG_UI = {
'en': {'progress.catalog_parallel':'Loading image models, Vision Advisor and health in parallel…'},
'fr': {'progress.catalog_parallel':'Chargement parallèle des modèles image, du Conseiller Vision et de la santé…'},
'es': {'progress.catalog_parallel':'Cargando en paralelo modelos de imagen, asesor visual y salud…'},
'de': {'progress.catalog_parallel':'Bildmodelle, Vision Advisor und Health parallel laden…'},
'it': {'progress.catalog_parallel':'Caricamento parallelo di modelli immagine, Advisor visivo e salute…'},
'zh': {'progress.catalog_parallel':'正在并行加载图像模型、视觉顾问和健康状态…'},
}
for _lang, _values in _PARALLEL_CONFIG_UI.items(): DICTS[_lang].update(_values)

_LIVE_MODELS_PROGRESS_UI = {
'en': {'progress.models':'Refreshing live Pollinations models…','progress.models_note':'Refreshing capabilities, availability and health before this operation so Auto and fallback use the current state.'},
'fr': {'progress.models':'Actualisation des modèles Pollinations live…','progress.models_note':'Actualisation des capacités, disponibilités et de la santé avant cette opération pour que Auto et fallback utilisent l’état actuel.'},
'es': {'progress.models':'Actualizando modelos Pollinations en vivo…','progress.models_note':'Actualizando capacidades, disponibilidad y salud para usar el estado actual en Auto y fallback.'},
'de': {'progress.models':'Live-Pollinations-Modelle aktualisieren…','progress.models_note':'Fähigkeiten, Verfügbarkeit und Health werden für Auto und Fallback aktualisiert.'},
'it': {'progress.models':'Aggiornamento modelli Pollinations live…','progress.models_note':'Aggiornamento di capacità, disponibilità e salute per Auto e fallback.'},
'zh': {'progress.models':'正在刷新实时 Pollinations 模型…','progress.models_note':'操作前刷新能力、可用性和健康状态，让 Auto 与回退使用当前状态。'},
}
for _lang, _values in _LIVE_MODELS_PROGRESS_UI.items(): DICTS[_lang].update(_values)

_BROWSER_ALPHA_UI = {
'en': {
 'browser.title':'Choose a model','browser.image_title':'Browse image models','browser.advisor_title':'Choose Vision Tool','browser.alpha_title':'Choose Pollinations Alpha model','browser.select':'Use selected model','browser.search':'Search model, provider, capability…','browser.open':'Open searchable model browser','browser.legend':'🌻 Quest   💎 Paid   ✓ Official   🧩 Community   ✏ Edit   ◩ Alpha   ● Healthy   ◐ Degraded   ○ Off   👁 Vision   🛠 Tools   🧠 Reasoning',
 'browser.filter.all':'All','browser.filter.quest':'Quest','browser.filter.paid':'Paid','browser.filter.official':'Official','browser.filter.community':'Community','browser.filter.healthy':'Healthy','browser.filter.edit':'Edit capable','browser.filter.alpha':'Alpha capable','browser.filter.reasoning':'Reasoning',
 'browser.sort.auto':'Auto score','browser.sort.cost':'Lowest cost','browser.sort.latency':'Lowest latency','browser.sort.name':'Name',
 'label.vision_tool':'Vision Tool','cost.before_run':'Estimated cost before run','cost.estimate':'≈ {cost} Pollen','cost.variable':'Variable — live/token-priced','cost.unknown':'Cost not advertised','cost.free_external':'Free external RMBG (quota applies)',
 'rmbg.pollinations':'Pollinations Alpha — promptable isolation','rmbg.alpha_model':'Pollinations Alpha model','progress.rmbg_pollinations':'Isolating with {model} + alpha…',
 'isolate.mode_help':'Choose a fast classic RMBG or a promptable Pollinations alpha model. Use Pollinations Alpha for complex edges, hair/fur, or when you need to specify exactly what to isolate.','isolate.subject':'Subject to isolate','isolate.subject_hint':'e.g. the woman with curly hair / the red chair / both cats','isolate.default_subject':'the principal subject inside the supplied image or selection','isolate.clearbackdrop_note':'Fast, zero-config and free. Best for a clear foreground/background separation.','isolate.alpha_note':'{model} receives the image plus a strict isolation instruction and must return real transparency. More semantic and usually better on difficult edges.','isolate.no_alpha':'No healthy edit-capable alpha model is currently available.'
},
'fr': {
 'browser.title':'Choisir un modèle','browser.image_title':'Explorer les modèles image','browser.advisor_title':'Choisir le Tool Vision','browser.alpha_title':'Choisir le modèle Pollinations Alpha','browser.select':'Utiliser ce modèle','browser.search':'Rechercher modèle, provider, capacité…','browser.open':'Ouvrir le navigateur de modèles','browser.legend':'🌻 Quest   💎 Paid   ✓ Officiel   🧩 Community   ✏ Édition   ◩ Alpha   ● Sain   ◐ Dégradé   ○ Off   👁 Vision   🛠 Tools   🧠 Raisonnement',
 'browser.filter.all':'Tous','browser.filter.quest':'Quest','browser.filter.paid':'Paid','browser.filter.official':'Officiels','browser.filter.community':'Community','browser.filter.healthy':'Sains','browser.filter.edit':'Édition','browser.filter.alpha':'Canal alpha','browser.filter.reasoning':'Raisonnement',
 'browser.sort.auto':'Score Auto','browser.sort.cost':'Coût croissant','browser.sort.latency':'Latence croissante','browser.sort.name':'Nom',
 'label.vision_tool':'Tool Vision','cost.before_run':'Coût estimé avant lancement','cost.estimate':'≈ {cost} Pollen','cost.variable':'Variable — tarif live/tokens','cost.unknown':'Coût non annoncé','cost.free_external':'RMBG externe gratuit (quota applicable)',
 'rmbg.pollinations':'Pollinations Alpha — isolation promptable','rmbg.alpha_model':'Modèle Pollinations Alpha','progress.rmbg_pollinations':'Isolation avec {model} + canal alpha…',
 'isolate.mode_help':'Choisissez un RMBG classique rapide ou un modèle Pollinations Alpha pilotable par prompt. Pollinations Alpha est recommandé pour cheveux/fourrure, contours difficiles ou lorsqu’il faut préciser exactement quoi isoler.','isolate.subject':'Sujet à isoler','isolate.subject_hint':'ex. la femme aux cheveux bouclés / le fauteuil rouge / les deux chats','isolate.default_subject':'le sujet principal dans l’image ou la sélection fournie','isolate.clearbackdrop_note':'Rapide, zéro configuration et gratuit. Idéal lorsque premier plan et arrière-plan sont bien séparés.','isolate.alpha_note':'{model} reçoit l’image et une consigne d’isolation stricte et doit rendre une vraie transparence. Plus sémantique et souvent meilleur sur les contours complexes.','isolate.no_alpha':'Aucun modèle alpha sain et capable d’édition n’est disponible actuellement.'
},
'es': {'browser.title':'Elegir modelo','browser.image_title':'Explorar modelos de imagen','browser.advisor_title':'Elegir herramienta de visión','browser.alpha_title':'Elegir modelo Pollinations Alpha','browser.select':'Usar modelo','browser.search':'Buscar modelo, proveedor, capacidad…','browser.open':'Abrir navegador de modelos','browser.legend':'🌻 Quest   💎 Paid   ✓ Oficial   🧩 Community   ✏ Edit   ◩ Alpha   ● Saludable   ◐ Degradado   ○ Off   👁 Visión   🛠 Tools   🧠 Razonamiento','browser.filter.all':'Todos','browser.filter.quest':'Quest','browser.filter.paid':'Paid','browser.filter.official':'Oficial','browser.filter.community':'Community','browser.filter.healthy':'Saludable','browser.filter.edit':'Edición','browser.filter.alpha':'Alpha','browser.filter.reasoning':'Razonamiento','browser.sort.auto':'Score Auto','browser.sort.cost':'Menor coste','browser.sort.latency':'Menor latencia','browser.sort.name':'Nombre','label.vision_tool':'Herramienta de visión','cost.before_run':'Coste estimado','cost.estimate':'≈ {cost} Pollen','cost.variable':'Variable — precio live/tokens','cost.unknown':'Coste no anunciado','cost.free_external':'RMBG externo gratis','rmbg.pollinations':'Pollinations Alpha','rmbg.alpha_model':'Modelo Alpha','progress.rmbg_pollinations':'Aislando con {model} + alpha…','isolate.mode_help':'RMBG clásico rápido o modelo Pollinations Alpha guiado por prompt.','isolate.subject':'Sujeto a aislar','isolate.subject_hint':'ej. la mujer con pelo rizado','isolate.default_subject':'el sujeto principal','isolate.clearbackdrop_note':'Rápido, gratuito y sin configuración.','isolate.alpha_note':'{model} usa una instrucción estricta y devuelve transparencia real.','isolate.no_alpha':'No hay modelo alpha saludable disponible.'},
'de': {'browser.title':'Modell wählen','browser.image_title':'Bildmodelle durchsuchen','browser.advisor_title':'Vision Tool wählen','browser.alpha_title':'Pollinations-Alpha-Modell wählen','browser.select':'Modell verwenden','browser.search':'Modell, Provider, Fähigkeit suchen…','browser.open':'Modellbrowser öffnen','browser.legend':'🌻 Quest   💎 Paid   ✓ Official   🧩 Community   ✏ Edit   ◩ Alpha   ● Healthy   ◐ Degraded   ○ Off   👁 Vision   🛠 Tools   🧠 Reasoning','browser.filter.all':'Alle','browser.filter.quest':'Quest','browser.filter.paid':'Paid','browser.filter.official':'Official','browser.filter.community':'Community','browser.filter.healthy':'Healthy','browser.filter.edit':'Edit','browser.filter.alpha':'Alpha','browser.filter.reasoning':'Reasoning','browser.sort.auto':'Auto Score','browser.sort.cost':'Kosten','browser.sort.latency':'Latenz','browser.sort.name':'Name','label.vision_tool':'Vision Tool','cost.before_run':'Geschätzte Kosten','cost.estimate':'≈ {cost} Pollen','cost.variable':'Variabel — live/tokenbasiert','cost.unknown':'Kosten unbekannt','cost.free_external':'Kostenloses externes RMBG','rmbg.pollinations':'Pollinations Alpha','rmbg.alpha_model':'Alpha-Modell','progress.rmbg_pollinations':'Isolieren mit {model} + Alpha…','isolate.mode_help':'Schnelles klassisches RMBG oder promptbares Pollinations-Alpha-Modell.','isolate.subject':'Zu isolierendes Motiv','isolate.subject_hint':'z.B. Frau mit lockigem Haar','isolate.default_subject':'Hauptmotiv','isolate.clearbackdrop_note':'Schnell, kostenlos, ohne Konfiguration.','isolate.alpha_note':'{model} erhält eine strikte Isolationsanweisung und liefert Transparenz.','isolate.no_alpha':'Kein gesundes Alpha-Modell verfügbar.'},
'it': {'browser.title':'Scegli modello','browser.image_title':'Esplora modelli immagine','browser.advisor_title':'Scegli Vision Tool','browser.alpha_title':'Scegli modello Pollinations Alpha','browser.select':'Usa modello','browser.search':'Cerca modello, provider, capacità…','browser.open':'Apri browser modelli','browser.legend':'🌻 Quest   💎 Paid   ✓ Official   🧩 Community   ✏ Edit   ◩ Alpha   ● Healthy   ◐ Degraded   ○ Off   👁 Vision   🛠 Tools   🧠 Reasoning','browser.filter.all':'Tutti','browser.filter.quest':'Quest','browser.filter.paid':'Paid','browser.filter.official':'Official','browser.filter.community':'Community','browser.filter.healthy':'Healthy','browser.filter.edit':'Edit','browser.filter.alpha':'Alpha','browser.filter.reasoning':'Reasoning','browser.sort.auto':'Score Auto','browser.sort.cost':'Costo','browser.sort.latency':'Latenza','browser.sort.name':'Nome','label.vision_tool':'Vision Tool','cost.before_run':'Costo stimato','cost.estimate':'≈ {cost} Pollen','cost.variable':'Variabile — live/token','cost.unknown':'Costo non pubblicato','cost.free_external':'RMBG esterno gratuito','rmbg.pollinations':'Pollinations Alpha','rmbg.alpha_model':'Modello Alpha','progress.rmbg_pollinations':'Isolamento con {model} + alpha…','isolate.mode_help':'RMBG classico rapido oppure modello Pollinations Alpha pilotato da prompt.','isolate.subject':'Soggetto da isolare','isolate.subject_hint':'es. donna con capelli ricci','isolate.default_subject':'soggetto principale','isolate.clearbackdrop_note':'Rapido, gratuito, zero config.','isolate.alpha_note':'{model} riceve una istruzione stretta e produce trasparenza.','isolate.no_alpha':'Nessun modello alpha sano disponibile.'},
'zh': {'browser.title':'选择模型','browser.image_title':'浏览图像模型','browser.advisor_title':'选择视觉工具','browser.alpha_title':'选择 Pollinations Alpha 模型','browser.select':'使用模型','browser.search':'搜索模型、提供商、能力…','browser.open':'打开模型浏览器','browser.legend':'🌻 Quest   💎 Paid   ✓ 官方   🧩 Community   ✏ 编辑   ◩ Alpha   ● 健康   ◐ 降级   ○ 离线   👁 视觉   🛠 工具   🧠 推理','browser.filter.all':'全部','browser.filter.quest':'Quest','browser.filter.paid':'Paid','browser.filter.official':'官方','browser.filter.community':'Community','browser.filter.healthy':'健康','browser.filter.edit':'编辑','browser.filter.alpha':'Alpha','browser.filter.reasoning':'推理','browser.sort.auto':'Auto 分数','browser.sort.cost':'最低成本','browser.sort.latency':'最低延迟','browser.sort.name':'名称','label.vision_tool':'视觉工具','cost.before_run':'运行前预计成本','cost.estimate':'≈ {cost} Pollen','cost.variable':'动态 — 实时/Token 计价','cost.unknown':'未公布成本','cost.free_external':'免费外部 RMBG','rmbg.pollinations':'Pollinations Alpha','rmbg.alpha_model':'Alpha 模型','progress.rmbg_pollinations':'使用 {model} + Alpha 隔离…','isolate.mode_help':'选择快速传统 RMBG 或可提示的 Pollinations Alpha 模型。','isolate.subject':'要隔离的主体','isolate.subject_hint':'例如：卷发女子','isolate.default_subject':'主要主体','isolate.clearbackdrop_note':'快速、免费、零配置。','isolate.alpha_note':'{model} 接收严格隔离指令并返回真实透明度。','isolate.no_alpha':'当前没有健康的 Alpha 模型。'}
}
for _lang,_values in _BROWSER_ALPHA_UI.items(): DICTS[_lang].update(_values)
_COST_RATE_UI={
'en':{'cost.token_rate':'Variable · {rate} Pollen / output image-token'},
'fr':{'cost.token_rate':'Variable · {rate} Pollen / image-token de sortie'},
'es':{'cost.token_rate':'Variable · {rate} Pollen / image-token de salida'},
'de':{'cost.token_rate':'Variabel · {rate} Pollen / Output-Image-Token'},
'it':{'cost.token_rate':'Variabile · {rate} Pollen / image-token output'},
'zh':{'cost.token_rate':'动态 · {rate} Pollen / 输出图像 token'},
}
for _lang,_values in _COST_RATE_UI.items(): DICTS[_lang].update(_values)

_PR_POLISH_UI = {
'en': {
 'model.median_latency':'median {seconds}s','model.p95_latency':'p95 {seconds}s','model.vision':'Vision','model.tools':'Tools',
 'cost.observed':'≈ {cost} / image · recent observed average','cost.token_variable':'Variable token-priced · catalog rate {rate} / output image-token',
 'browser.filter_label':'Filter','browser.sort_label':'Sort','legend.image':'Image model','legend.edit':'Edit capable','legend.quest':'Quest / Paid','legend.health':'Live health',
 'browser.auto_desc':'Auto currently resolves to {model}; it is recalculated from live catalog, health, cost and capabilities.','browser.auto_detail':'Auto will currently use {model}.',
 'settings.auto_short':'Auto','settings.browser_only_note':'Model choices use the searchable browser only — no scroll-wheel selector can change a model accidentally.',
 'settings.review':'Ask the Vision Advisor before running by default (advice is never auto-applied)',
 'review.checkbox':'Ask the Vision Advisor before running (do not auto-apply)',
 'advisor.suggested_model':'Suggested model:','advisor.suggested_operation':'Suggested operation:','advisor.accept_flow':'Accept suggested flow','advisor.restore_original':'Restore original prompt & choices','advisor.applied':'Suggested flow applied — Restore remains available.',
 'rmbg.pr_help':'PR scope: ClearBackdrop is the only RMBG provider. It is zero-config, fast and currently offers 100 requests/hour/IP. Advanced alpha and multi-provider routing are intentionally out of scope.','rmbg.disabled':'RMBG is disabled in Pollinations AI Settings.'
},
'fr': {
 'model.median_latency':'médiane {seconds}s','model.p95_latency':'p95 {seconds}s','model.vision':'Vision','model.tools':'Tools',
 'cost.observed':'≈ {cost} / image · moyenne réellement observée récemment','cost.token_variable':'Tarif variable aux tokens · catalogue {rate} / image-token de sortie',
 'browser.filter_label':'Filtrer','browser.sort_label':'Trier','legend.image':'Modèle image','legend.edit':'Capable d’édition','legend.quest':'Quest / Paid','legend.health':'Santé live',
 'browser.auto_desc':'Auto choisit actuellement {model} ; ce choix est recalculé depuis le catalogue, la santé, le coût et les capacités live.','browser.auto_detail':'Auto utiliserait actuellement {model}.',
 'settings.auto_short':'Auto','settings.browser_only_note':'Les modèles se choisissent uniquement dans le navigateur avec recherche — aucune molette ne peut changer un modèle par accident.',
 'settings.review':'Demander conseil au Conseiller Vision avant lancement par défaut (jamais appliqué automatiquement)',
 'review.checkbox':'Demander conseil au Conseiller Vision avant lancement (ne rien appliquer automatiquement)',
 'advisor.suggested_model':'Modèle conseillé :','advisor.suggested_operation':'Opération conseillée :','advisor.accept_flow':'Accepter le flux conseillé','advisor.restore_original':'Revenir au prompt et choix d’origine','advisor.applied':'Flux conseillé appliqué — le retour à l’original reste disponible.',
 'rmbg.pr_help':'Périmètre PR : ClearBackdrop est l’unique provider RMBG. Zéro configuration, rapide, avec actuellement 100 requêtes/heure/IP. L’alpha avancé et le multi-provider sont volontairement réservés au futur plugin.','rmbg.disabled':'Le RMBG est désactivé dans les réglages Pollinations AI.'
},
'es': {
 'model.median_latency':'mediana {seconds}s','model.p95_latency':'p95 {seconds}s','model.vision':'Visión','model.tools':'Tools','cost.observed':'≈ {cost} / imagen · media reciente observada','cost.token_variable':'Precio variable por tokens · catálogo {rate} / image-token de salida','browser.filter_label':'Filtrar','browser.sort_label':'Ordenar','legend.image':'Modelo de imagen','legend.edit':'Edición','legend.quest':'Quest / Paid','legend.health':'Salud live','browser.auto_desc':'Auto resuelve ahora a {model}; se recalcula con catálogo, salud, coste y capacidades.','browser.auto_detail':'Auto usaría ahora {model}.','settings.auto_short':'Auto','settings.browser_only_note':'Los modelos se eligen solo en el navegador buscable; la rueda no puede cambiarlos por accidente.','settings.review':'Pedir consejo al asesor visual antes de ejecutar por defecto (nunca autoaplicado)','review.checkbox':'Pedir consejo al asesor visual antes de ejecutar (no autoaplicar)','advisor.suggested_model':'Modelo sugerido:','advisor.suggested_operation':'Operación sugerida:','advisor.accept_flow':'Aceptar flujo sugerido','advisor.restore_original':'Restaurar prompt y opciones originales','advisor.applied':'Flujo sugerido aplicado; Restaurar sigue disponible.','rmbg.pr_help':'Alcance PR: ClearBackdrop es el único RMBG, rápido y sin configuración. Alpha avanzado y multi-provider quedan fuera de esta PR.','rmbg.disabled':'RMBG está desactivado.'
},
'de': {
 'model.median_latency':'Median {seconds}s','model.p95_latency':'p95 {seconds}s','model.vision':'Vision','model.tools':'Tools','cost.observed':'≈ {cost} / Bild · kürzlich beobachteter Durchschnitt','cost.token_variable':'Variable Token-Kosten · Katalograte {rate} / Output-Image-Token','browser.filter_label':'Filter','browser.sort_label':'Sortieren','legend.image':'Bildmodell','legend.edit':'Edit-fähig','legend.quest':'Quest / Paid','legend.health':'Live Health','browser.auto_desc':'Auto nutzt aktuell {model}; Auswahl wird aus Katalog, Health, Kosten und Fähigkeiten neu berechnet.','browser.auto_detail':'Auto würde aktuell {model} nutzen.','settings.auto_short':'Auto','settings.browser_only_note':'Modelle werden nur im durchsuchbaren Browser gewählt; das Mausrad kann nichts versehentlich ändern.','settings.review':'Vision Advisor standardmäßig vor Ausführung fragen (niemals automatisch anwenden)','review.checkbox':'Vision Advisor vor Ausführung fragen (nicht automatisch anwenden)','advisor.suggested_model':'Empfohlenes Modell:','advisor.suggested_operation':'Empfohlene Operation:','advisor.accept_flow':'Empfohlenen Ablauf übernehmen','advisor.restore_original':'Original-Prompt und Auswahl wiederherstellen','advisor.applied':'Empfohlener Ablauf übernommen; Wiederherstellen bleibt verfügbar.','rmbg.pr_help':'PR-Scope: nur ClearBackdrop als RMBG, schnell und ohne Konfiguration. Advanced Alpha und Multi-Provider bleiben außerhalb dieser PR.','rmbg.disabled':'RMBG ist deaktiviert.'
},
'it': {
 'model.median_latency':'mediana {seconds}s','model.p95_latency':'p95 {seconds}s','model.vision':'Vision','model.tools':'Tools','cost.observed':'≈ {cost} / immagine · media recente osservata','cost.token_variable':'Costo variabile a token · catalogo {rate} / image-token output','browser.filter_label':'Filtra','browser.sort_label':'Ordina','legend.image':'Modello immagine','legend.edit':'Modifica','legend.quest':'Quest / Paid','legend.health':'Salute live','browser.auto_desc':'Auto usa ora {model}; viene ricalcolato da catalogo, salute, costo e capacità.','browser.auto_detail':'Auto userebbe ora {model}.','settings.auto_short':'Auto','settings.browser_only_note':'I modelli si scelgono solo nel browser ricercabile; la rotella non può cambiarli per errore.','settings.review':'Chiedi consiglio al Vision Advisor prima dell’esecuzione (mai applicato automaticamente)','review.checkbox':'Chiedi consiglio al Vision Advisor prima dell’esecuzione (non auto-applicare)','advisor.suggested_model':'Modello consigliato:','advisor.suggested_operation':'Operazione consigliata:','advisor.accept_flow':'Accetta flusso consigliato','advisor.restore_original':'Ripristina prompt e scelte originali','advisor.applied':'Flusso consigliato applicato; Ripristina resta disponibile.','rmbg.pr_help':'Scope PR: ClearBackdrop è l’unico RMBG, rapido e zero-config. Alpha avanzato e multi-provider restano fuori da questa PR.','rmbg.disabled':'RMBG è disattivato.'
},
'zh': {
 'model.median_latency':'中位延迟 {seconds}s','model.p95_latency':'p95 {seconds}s','model.vision':'视觉','model.tools':'工具','cost.observed':'≈ {cost} / 图像 · 近期实际平均','cost.token_variable':'按 token 动态计价 · 目录费率 {rate} / 输出图像 token','browser.filter_label':'筛选','browser.sort_label':'排序','legend.image':'图像模型','legend.edit':'支持编辑','legend.quest':'Quest / Paid','legend.health':'实时健康','browser.auto_desc':'Auto 当前选择 {model}，并会根据实时目录、健康、成本和能力重新计算。','browser.auto_detail':'Auto 当前会使用 {model}。','settings.auto_short':'Auto','settings.browser_only_note':'模型只通过可搜索浏览器选择，滚轮不会误改模型。','settings.review':'默认在执行前询问视觉顾问（建议永不自动应用）','review.checkbox':'执行前询问视觉顾问（不自动应用）','advisor.suggested_model':'建议模型：','advisor.suggested_operation':'建议操作：','advisor.accept_flow':'接受建议流程','advisor.restore_original':'恢复原始提示词和选择','advisor.applied':'建议流程已应用，仍可恢复原始设置。','rmbg.pr_help':'PR 范围：RMBG 仅使用 ClearBackdrop，快速且零配置。高级 Alpha 与多 Provider 留给未来插件。','rmbg.disabled':'RMBG 已禁用。'
}
}
for _lang,_values in _PR_POLISH_UI.items(): DICTS[_lang].update(_values)
for _lang,_text in {
'en':'plus free ClearBackdrop RMBG','fr':'+ RMBG ClearBackdrop gratuit','es':'+ RMBG ClearBackdrop gratis','de':'+ kostenloses ClearBackdrop RMBG','it':'+ RMBG ClearBackdrop gratuito','zh':'+ 免费 ClearBackdrop RMBG'
}.items(): DICTS[_lang]['cost.plus_free_rmbg']=_text
_ACTIVITY_UI={
'en':{'menu.activity':'Activity & Usage…','activity.title':'Pollinations AI — Activity & Usage','activity.plugin_log':'Plugin Log','activity.api_usage':'API Usage','activity.empty':'No Pollinations operations logged yet.','activity.no_api_usage':'No API usage available for this key.','activity.manual_choice':'Manual model choice','activity.auto_reason':'Auto: task fit + live health + cost/preferences','activity.advice_applied':'advice accepted','activity.advice_not_applied':'advice kept as suggestion only','button.close':'Close'},
'fr':{'menu.activity':'Activité & consommation…','activity.title':'Pollinations AI — Activité & consommation','activity.plugin_log':'Journal du plugin','activity.api_usage':'Consommation API','activity.empty':'Aucune opération Pollinations journalisée pour le moment.','activity.no_api_usage':'Aucune consommation API disponible pour cette clé.','activity.manual_choice':'Modèle choisi manuellement','activity.auto_reason':'Auto : adéquation tâche + santé live + coût/préférences','activity.advice_applied':'conseil accepté','activity.advice_not_applied':'conseil conservé comme suggestion uniquement','button.close':'Fermer'},
'es':{'menu.activity':'Actividad y uso…','activity.title':'Pollinations AI — Actividad y uso','activity.plugin_log':'Registro del plugin','activity.api_usage':'Uso API','activity.empty':'Todavía no hay operaciones registradas.','activity.no_api_usage':'No hay uso API disponible.','activity.manual_choice':'Modelo elegido manualmente','activity.auto_reason':'Auto: tarea + salud + coste/preferencias','activity.advice_applied':'consejo aceptado','activity.advice_not_applied':'consejo solo sugerido','button.close':'Cerrar'},
'de':{'menu.activity':'Aktivität & Nutzung…','activity.title':'Pollinations AI — Aktivität & Nutzung','activity.plugin_log':'Plugin-Protokoll','activity.api_usage':'API-Nutzung','activity.empty':'Noch keine Operationen protokolliert.','activity.no_api_usage':'Keine API-Nutzung verfügbar.','activity.manual_choice':'Modell manuell gewählt','activity.auto_reason':'Auto: Aufgabe + Live Health + Kosten/Präferenzen','activity.advice_applied':'Empfehlung übernommen','activity.advice_not_applied':'nur als Empfehlung gezeigt','button.close':'Schließen'},
'it':{'menu.activity':'Attività e utilizzo…','activity.title':'Pollinations AI — Attività e utilizzo','activity.plugin_log':'Log plugin','activity.api_usage':'Utilizzo API','activity.empty':'Nessuna operazione registrata.','activity.no_api_usage':'Nessun utilizzo API disponibile.','activity.manual_choice':'Modello scelto manualmente','activity.auto_reason':'Auto: attività + salute + costo/preferenze','activity.advice_applied':'consiglio accettato','activity.advice_not_applied':'solo suggerimento','button.close':'Chiudi'},
'zh':{'menu.activity':'活动与用量…','activity.title':'Pollinations AI — 活动与用量','activity.plugin_log':'插件日志','activity.api_usage':'API 用量','activity.empty':'暂无已记录的 Pollinations 操作。','activity.no_api_usage':'此密钥暂无 API 用量。','activity.manual_choice':'手动选择模型','activity.auto_reason':'Auto：任务匹配 + 实时健康 + 成本/偏好','activity.advice_applied':'已接受建议','activity.advice_not_applied':'仅保留为建议','button.close':'关闭'}
}
for _lang,_values in _ACTIVITY_UI.items(): DICTS[_lang].update(_values)
_MAGIC_LABELS={
'en':{'menu.separate':'Magic Separate — Object + Background…','separate.help':'Optional selection = spatial hint. Optional text = subject hint. ClearBackdrop extracts original pixels; the same alpha mask is punched from the active layer; one AI edit reconstructs only the missing full-size background.','menu.context':'Add / Replace / Remove Object…'},
'fr':{'menu.separate':'Magic Separate — Objet + arrière-plan…','separate.help':'Sélection facultative = indice spatial. Texte facultatif = indice sur le sujet. ClearBackdrop détoure les pixels originaux ; le même masque alpha creuse le calque actif ; un seul edit IA reconstruit uniquement le fond manquant en pleine taille.','menu.context':'Ajouter / Remplacer / Supprimer un objet…'},
'es':{'menu.separate':'Magic Separate — Objeto + fondo…','separate.help':'La selección y el texto son opcionales. ClearBackdrop extrae los píxeles originales; la misma máscara perfora la capa activa; una sola edición IA reconstruye el fondo completo faltante.','menu.context':'Añadir / Reemplazar / Eliminar objeto…'},
'de':{'menu.separate':'Magic Separate — Objekt + Hintergrund…','separate.help':'Auswahl und Text sind optional. ClearBackdrop extrahiert Originalpixel; dieselbe Alpha-Maske stanzt die aktive Ebene aus; ein AI-Edit rekonstruiert den fehlenden Hintergrund in voller Größe.','menu.context':'Objekt hinzufügen / ersetzen / entfernen…'},
'it':{'menu.separate':'Magic Separate — Oggetto + sfondo…','separate.help':'Selezione e testo sono opzionali. ClearBackdrop estrae i pixel originali; la stessa maschera fora il livello attivo; un solo edit AI ricostruisce lo sfondo mancante a piena dimensione.','menu.context':'Aggiungi / Sostituisci / Rimuovi oggetto…'},
'zh':{'menu.separate':'Magic Separate — 对象 + 背景…','separate.help':'选区和文字均可选。ClearBackdrop 提取原始像素；同一 Alpha 蒙版在活动图层中挖空；一次 AI 编辑以完整尺寸重建缺失背景。','menu.context':'添加 / 替换 / 移除对象…'}
}
for _lang,_values in _MAGIC_LABELS.items(): DICTS[_lang].update(_values)

_FINAL_VALIDATION_UI = {
'en': {
 'menu.activity':'Account & Usage…','activity.title':'Pollinations AI — Account & Usage','menu.about':'About…','about.title':'About Pollinations AI for GIMP','about.replay':'Replay onboarding',
 'settings.advisor_enabled':'Enable Vision Advisor in workflows','settings.review':'Ask the Vision Advisor automatically before running','review.checkbox':'Ask Advisor before running','button.review':'Advisor & prompt enhancement…',
 'advisor.proposal_title':'Vision Advisor proposal','advisor.keep_original':'Keep original','advisor.prompt_suggestion':'Suggested execution prompt','advisor.explicit_note':'Nothing changes unless you accept this proposal.','advisor.accept_flow':'Accept suggestion','advisor.restore_original':'Restore original prompt & choices',
 'account.connect_hint':'Connect a Pollinations account to see identity, key budget and usage.','account.key':'Key: {name} · {type}','account.key_balance':'Key balance: {value}','account.key_budget':'Key budget cap: {value}','account.wallet':'Wallet: {total} total · {quest} Quest · {paid} Paid','account.community_allowed':'Community model publishing enabled for this account.'
},
'fr': {
 'menu.activity':'Compte & consommation…','activity.title':'Pollinations AI — Compte & consommation','menu.about':'À propos…','about.title':'À propos de Pollinations AI pour GIMP','about.replay':'Rejouer l’onboarding',
 'settings.advisor_enabled':'Activer le Conseiller Vision dans les workflows','settings.review':'Demander automatiquement conseil avant lancement','review.checkbox':'Demander conseil avant lancement','button.review':'Conseiller & améliorer le prompt…',
 'advisor.proposal_title':'Proposition du Conseiller Vision','advisor.keep_original':'Garder l’original','advisor.prompt_suggestion':'Prompt d’exécution conseillé','advisor.explicit_note':'Rien ne change tant que vous n’acceptez pas cette proposition.','advisor.accept_flow':'Accepter le conseil','advisor.restore_original':'Revenir au prompt et choix d’origine',
 'account.connect_hint':'Connectez un compte Pollinations pour afficher identité, budget de clé et consommation.','account.key':'Clé : {name} · {type}','account.key_balance':'Solde visible de la clé : {value}','account.key_budget':'Plafond budget de la clé : {value}','account.wallet':'Wallet : {total} total · {quest} Quest · {paid} Paid','account.community_allowed':'Publication de modèles Community autorisée pour ce compte.'
},
'es': {
 'menu.activity':'Cuenta y uso…','activity.title':'Pollinations AI — Cuenta y uso','menu.about':'Acerca de…','about.title':'Acerca de Pollinations AI para GIMP','about.replay':'Repetir onboarding','settings.advisor_enabled':'Activar asesor visual en los flujos','settings.review':'Pedir consejo automáticamente antes de ejecutar','review.checkbox':'Pedir consejo antes de ejecutar','button.review':'Asesor y mejora de prompt…','advisor.proposal_title':'Propuesta del asesor visual','advisor.keep_original':'Mantener original','advisor.prompt_suggestion':'Prompt de ejecución sugerido','advisor.explicit_note':'Nada cambia hasta aceptar la propuesta.','advisor.accept_flow':'Aceptar sugerencia','advisor.restore_original':'Restaurar prompt y opciones originales','account.connect_hint':'Conecta Pollinations para ver identidad, presupuesto y uso.','account.key':'Clave: {name} · {type}','account.key_balance':'Saldo de clave: {value}','account.key_budget':'Límite de presupuesto: {value}','account.wallet':'Wallet: {total} total · {quest} Quest · {paid} Paid','account.community_allowed':'Publicación Community habilitada.'
},
'de': {
 'menu.activity':'Konto & Nutzung…','activity.title':'Pollinations AI — Konto & Nutzung','menu.about':'Über…','about.title':'Über Pollinations AI für GIMP','about.replay':'Onboarding erneut zeigen','settings.advisor_enabled':'Vision Advisor in Workflows aktivieren','settings.review':'Advisor automatisch vor Ausführung fragen','review.checkbox':'Advisor vor Ausführung fragen','button.review':'Advisor & Prompt verbessern…','advisor.proposal_title':'Vorschlag des Vision Advisors','advisor.keep_original':'Original behalten','advisor.prompt_suggestion':'Empfohlener Ausführungs-Prompt','advisor.explicit_note':'Ohne Zustimmung wird nichts geändert.','advisor.accept_flow':'Vorschlag übernehmen','advisor.restore_original':'Original-Prompt und Auswahl wiederherstellen','account.connect_hint':'Pollinations verbinden, um Identität, Key-Budget und Nutzung zu sehen.','account.key':'Key: {name} · {type}','account.key_balance':'Key-Saldo: {value}','account.key_budget':'Key-Budgetlimit: {value}','account.wallet':'Wallet: {total} gesamt · {quest} Quest · {paid} Paid','account.community_allowed':'Community-Publishing aktiviert.'
},
'it': {
 'menu.activity':'Account e utilizzo…','activity.title':'Pollinations AI — Account e utilizzo','menu.about':'Informazioni…','about.title':'Informazioni su Pollinations AI per GIMP','about.replay':'Ripeti onboarding','settings.advisor_enabled':'Abilita Vision Advisor nei workflow','settings.review':'Chiedi automaticamente consiglio prima dell’esecuzione','review.checkbox':'Chiedi consiglio prima dell’esecuzione','button.review':'Advisor e miglioramento prompt…','advisor.proposal_title':'Proposta Vision Advisor','advisor.keep_original':'Mantieni originale','advisor.prompt_suggestion':'Prompt di esecuzione suggerito','advisor.explicit_note':'Non cambia nulla finché non accetti.','advisor.accept_flow':'Accetta consiglio','advisor.restore_original':'Ripristina prompt e scelte originali','account.connect_hint':'Connetti Pollinations per vedere identità, budget chiave e utilizzo.','account.key':'Chiave: {name} · {type}','account.key_balance':'Saldo chiave: {value}','account.key_budget':'Limite budget chiave: {value}','account.wallet':'Wallet: {total} totale · {quest} Quest · {paid} Paid','account.community_allowed':'Pubblicazione Community abilitata.'
},
'zh': {
 'menu.activity':'账户与用量…','activity.title':'Pollinations AI — 账户与用量','menu.about':'关于…','about.title':'关于 GIMP Pollinations AI','about.replay':'重新播放引导','settings.advisor_enabled':'在工作流中启用视觉顾问','settings.review':'运行前自动询问视觉顾问','review.checkbox':'运行前询问顾问','button.review':'顾问与提示词增强…','advisor.proposal_title':'视觉顾问建议','advisor.keep_original':'保留原始设置','advisor.prompt_suggestion':'建议执行提示词','advisor.explicit_note':'只有接受后才会修改设置。','advisor.accept_flow':'接受建议','advisor.restore_original':'恢复原始提示词和选择','account.connect_hint':'连接 Pollinations 后可查看身份、密钥预算和用量。','account.key':'密钥：{name} · {type}','account.key_balance':'密钥余额：{value}','account.key_budget':'密钥预算上限：{value}','account.wallet':'钱包：总计 {total} · Quest {quest} · Paid {paid}','account.community_allowed':'已启用 Community 模型发布。'
}
}
for _lang,_values in _FINAL_VALIDATION_UI.items(): DICTS[_lang].update(_values)

_ADVISOR_FINAL_UI = {
'en': {
 'advisor.accept_prompt':'Use suggested prompt only',
 'advisor.accept_model':'Use suggested model only',
 'advisor.accept_both':'Use suggested prompt + model',
 'advisor.explicit_note':'Choose exactly what to apply. The suggested operation remains advisory and is never changed automatically.',
},
'fr': {
 'advisor.accept_prompt':'Garder uniquement le prompt conseillé',
 'advisor.accept_model':'Passer uniquement au modèle conseillé',
 'advisor.accept_both':'Accepter prompt + modèle conseillés',
 'advisor.explicit_note':'Choisissez exactement ce qui doit changer. L’opération conseillée reste informative et n’est jamais modifiée automatiquement.',
},
'es': {
 'advisor.accept_prompt':'Usar solo el prompt sugerido',
 'advisor.accept_model':'Usar solo el modelo sugerido',
 'advisor.accept_both':'Usar prompt + modelo sugeridos',
 'advisor.explicit_note':'Elige exactamente qué aplicar. La operación sugerida sigue siendo solo informativa.',
},
'de': {
 'advisor.accept_prompt':'Nur empfohlenen Prompt verwenden',
 'advisor.accept_model':'Nur empfohlenes Modell verwenden',
 'advisor.accept_both':'Empfohlenen Prompt + Modell verwenden',
 'advisor.explicit_note':'Wähle genau, was übernommen wird. Die empfohlene Operation bleibt rein beratend.',
},
'it': {
 'advisor.accept_prompt':'Usa solo il prompt consigliato',
 'advisor.accept_model':'Usa solo il modello consigliato',
 'advisor.accept_both':'Usa prompt + modello consigliati',
 'advisor.explicit_note':'Scegli esattamente cosa applicare. L’operazione consigliata resta solo informativa.',
},
'zh': {
 'advisor.accept_prompt':'仅使用建议提示词',
 'advisor.accept_model':'仅使用建议模型',
 'advisor.accept_both':'使用建议提示词 + 模型',
 'advisor.explicit_note':'请选择要应用的内容。建议的操作仅供参考，不会自动修改。',
},
}
for _lang_key, _values in _ADVISOR_FINAL_UI.items():
    DICTS.setdefault(_lang_key, {}).update(_values)

_SEPARATE_FINAL_UI = {
'en': {
 'separate.reconstruction_model':'Background reconstruction model',
 'separate.no_prompt_help':'ClearBackdrop isolates the foreground without a text prompt. The selected AI model is used only to reconstruct the missing background.',
 'separate.selection_hint':'A selection is active: it is used only as an optional spatial hint for the foreground extraction.',
 'separate.no_selection_hint':'No selection: ClearBackdrop extracts the main foreground subject automatically.',
},
'fr': {
 'separate.reconstruction_model':'Modèle de reconstruction du fond',
 'separate.no_prompt_help':'ClearBackdrop détoure le premier plan sans prompt texte. Le modèle IA choisi sert uniquement à reconstruire le fond manquant.',
 'separate.selection_hint':'Une sélection est active : elle sert uniquement d’indice spatial facultatif pour le détourage.',
 'separate.no_selection_hint':'Aucune sélection : ClearBackdrop détoure automatiquement le sujet principal au premier plan.',
},
'es': {
 'separate.reconstruction_model':'Modelo de reconstrucción del fondo',
 'separate.no_prompt_help':'ClearBackdrop aísla el primer plano sin prompt. El modelo IA elegido solo reconstruye el fondo faltante.',
 'separate.selection_hint':'Hay una selección activa: solo se usa como pista espacial opcional.',
 'separate.no_selection_hint':'Sin selección: ClearBackdrop extrae automáticamente el sujeto principal.',
},
'de': {
 'separate.reconstruction_model':'Modell für Hintergrundrekonstruktion',
 'separate.no_prompt_help':'ClearBackdrop isoliert den Vordergrund ohne Text-Prompt. Das gewählte KI-Modell rekonstruiert nur den fehlenden Hintergrund.',
 'separate.selection_hint':'Eine Auswahl ist aktiv und dient nur als optionaler räumlicher Hinweis.',
 'separate.no_selection_hint':'Keine Auswahl: ClearBackdrop extrahiert automatisch das Hauptmotiv.',
},
'it': {
 'separate.reconstruction_model':'Modello di ricostruzione dello sfondo',
 'separate.no_prompt_help':'ClearBackdrop isola il primo piano senza prompt testuale. Il modello IA scelto ricostruisce solo lo sfondo mancante.',
 'separate.selection_hint':'È attiva una selezione: viene usata solo come indizio spaziale opzionale.',
 'separate.no_selection_hint':'Nessuna selezione: ClearBackdrop estrae automaticamente il soggetto principale.',
},
'zh': {
 'separate.reconstruction_model':'背景重建模型',
 'separate.no_prompt_help':'ClearBackdrop 无需文本提示即可分离前景；所选 AI 模型仅用于重建缺失背景。',
 'separate.selection_hint':'当前有选区：它仅作为可选的空间提示。',
 'separate.no_selection_hint':'无选区：ClearBackdrop 会自动提取主要前景主体。',
},
}
for _lang_key, _values in _SEPARATE_FINAL_UI.items():
    DICTS[_lang_key].update(_values)
