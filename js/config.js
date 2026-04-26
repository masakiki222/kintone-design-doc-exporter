((PLUGIN_ID) => {
  'use strict';

  const LEGACY_DOCUMENT_TITLE_PREFIX = 'kintone App Design Document';
  const STATUS_CLASS_NAMES = ['is-info', 'is-success', 'is-error'];

  // プラグイン設定画面の初期値。
  // kintone のプラグイン設定は文字列で保存されるため、
  // 真偽値もここでは文字列の "true" / "false" で扱う。
  const DEFAULT_CONFIG = {
    documentTitlePrefix: 'kintoneアプリ設計書',
    outputFilePrefix: 'kintone-design-doc',
    settingsScope: 'live',
    includeRawJson: 'true',
    includePermissions: 'true',
    includeNotifications: 'true',
    includeCustomization: 'true',
    includeAdminNotes: 'true'
  };

  // 保存済み設定を読み込み、未設定項目はデフォルト値で補う。
  const readConfig = () => {
    const savedConfig = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    const config = Object.assign({}, DEFAULT_CONFIG, savedConfig);

    // 以前の英語デフォルトを保存済みだった場合は、新しい日本語デフォルトへ寄せる。
    if (config.documentTitlePrefix === LEGACY_DOCUMENT_TITLE_PREFIX) {
      config.documentTitlePrefix = DEFAULT_CONFIG.documentTitlePrefix;
    }

    return config;
  };

  // チェックボックスへ流し込むため、文字列の真偽値を通常の boolean に戻す。
  const boolFromConfig = (value) => value === 'true';

  // 前後の空白を取り除き、空なら既定値を返す。
  const normalizeText = (value, fallbackValue) => {
    const text = String(value || '').trim();
    return text || fallbackValue;
  };

  // ファイル名に使えない文字や余分な空白を除去して、
  // ダウンロード時に安全なプレフィックスへ整える。
  const normalizeFilePrefix = (value) => {
    const normalized = normalizeText(value, DEFAULT_CONFIG.outputFilePrefix)
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return normalized || DEFAULT_CONFIG.outputFilePrefix;
  };

  // 保存済み設定をフォームに反映する。
  // ここで設定画面を開いたときに前回値がそのまま表示される。
  const setInitialValues = (config) => {
    document.getElementById('document-title-prefix').value =
      config.documentTitlePrefix;
    document.getElementById('output-file-prefix').value =
      config.outputFilePrefix;
    document.getElementById('settings-scope').value = config.settingsScope;
    document.getElementById('include-raw-json').checked = boolFromConfig(
      config.includeRawJson
    );
    document.getElementById('include-permissions').checked = boolFromConfig(
      config.includePermissions
    );
    document.getElementById('include-notifications').checked = boolFromConfig(
      config.includeNotifications
    );
    document.getElementById('include-customization').checked = boolFromConfig(
      config.includeCustomization
    );
    document.getElementById('include-admin-notes').checked = boolFromConfig(
      config.includeAdminNotes
    );
  };

  // 画面上の入力内容を、保存用の設定オブジェクトへまとめる。
  // kintone.plugin.app.setConfig() にそのまま渡せる形にしている。
  const collectFormValues = () => {
    const settingsScope = document.getElementById('settings-scope').value;

    return {
      documentTitlePrefix: normalizeText(
        document.getElementById('document-title-prefix').value,
        DEFAULT_CONFIG.documentTitlePrefix
      ),
      outputFilePrefix: normalizeFilePrefix(
        document.getElementById('output-file-prefix').value
      ),
      settingsScope: settingsScope === 'preview' ? 'preview' : 'live',
      includeRawJson: String(
        document.getElementById('include-raw-json').checked
      ),
      includePermissions: String(
        document.getElementById('include-permissions').checked
      ),
      includeNotifications: String(
        document.getElementById('include-notifications').checked
      ),
      includeCustomization: String(
        document.getElementById('include-customization').checked
      ),
      includeAdminNotes: String(
        document.getElementById('include-admin-notes').checked
      )
    };
  };

  // 保存済み設定と画面上の入力値が同じかどうかを比較する。
  // 設計書出力ボタンは保存済み設定のみを使うため、
  // ここで差分を検出して注意文言を切り替える。
  const configsEqual = (left, right) =>
    Object.keys(DEFAULT_CONFIG).every((key) => {
      return String(left[key] || '') === String(right[key] || '');
    });

  // 画面下部のメッセージ領域を、成功 / エラー / 情報で出し分ける。
  const showStatusMessage = (element, text, tone) => {
    element.hidden = false;
    element.textContent = text;
    STATUS_CLASS_NAMES.forEach((className) => {
      element.classList.remove(className);
    });

    if (tone) {
      element.classList.add('is-' + tone);
    }
  };

  // メッセージが不要なときは非表示へ戻す。
  const clearStatusMessage = (element) => {
    element.hidden = true;
    element.textContent = '';
    STATUS_CLASS_NAMES.forEach((className) => {
      element.classList.remove(className);
    });
  };

  // 保存中 / 出力中はボタン文言と disabled をまとめて切り替える。
  const setButtonBusy = (button, isBusy, idleText, busyText) => {
    button.disabled = isBusy;
    button.textContent = isBusy ? busyText : idleText;
  };

  // 設定画面から戻るURLの組み立てに使う。
  const appId = kintone.app.getId();
  const exporter = window.KintoneDesignDocExporter || null;
  const form = document.getElementById('plugin-form');
  const saveButton = form.querySelector('button[type="submit"]');
  const cancelButton = document.getElementById('cancel-button');
  const exportButton = document.getElementById('export-button');
  const exportNote = document.getElementById('export-note');
  const statusMessage = document.getElementById('status-message');
  let savedConfig = readConfig();

  // 画面表示直後に、保存済み設定をフォームへ反映する。
  setInitialValues(savedConfig);

  // 未保存変更があるときは、設計書出力に反映されないことを明示する。
  const updateExportNote = () => {
    const hasUnsavedChanges = !configsEqual(savedConfig, collectFormValues());

    if (hasUnsavedChanges) {
      exportNote.textContent =
        'フォームに未保存の変更があります。出力には反映されません。必要に応じて先に「設定を保存」を実行してください。';
      exportNote.classList.add('is-warning');
      return;
    }

    exportNote.textContent =
      '前回保存した設定で出力されます。設定を変更した場合は、先に「設定を保存」を実行してください。';
    exportNote.classList.remove('is-warning');
  };

  updateExportNote();

  if (!exporter || typeof exporter.exportDesignDocument !== 'function') {
    exportButton.disabled = true;
    showStatusMessage(
      statusMessage,
      '設計書出力の初期化に失敗しました。プラグインのJavaScript構成を確認してください。',
      'error'
    );
  }

  form.addEventListener('input', () => {
    updateExportNote();
  });

  form.addEventListener('change', () => {
    updateExportNote();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    // 入力内容を集めて、そのままプラグイン設定として保存する。
    const nextConfig = collectFormValues();
    clearStatusMessage(statusMessage);
    setButtonBusy(saveButton, true, '設定を保存', '保存中...');
    exportButton.disabled = true;

    kintone.plugin.app.setConfig(nextConfig, () => {
      // 保存直後の値をこの画面の基準値として持ち直し、
      // すぐ下の「保存済み設定で出力」にも同じ値を使えるようにする。
      savedConfig = Object.assign({}, nextConfig);
      setInitialValues(savedConfig);
      updateExportNote();
      setButtonBusy(saveButton, false, '設定を保存', '保存中...');
      exportButton.disabled = !exporter;
      showStatusMessage(
        statusMessage,
        '設定を保存しました。この画面の出力には反映済みです。アプリへ反映するには、保存後にアプリ更新も実行してください。',
        'success'
      );
    });
  });

  exportButton.addEventListener('click', async () => {
    if (!exporter || typeof exporter.exportDesignDocument !== 'function') {
      return;
    }

    clearStatusMessage(statusMessage);
    setButtonBusy(exportButton, true, '保存済み設定で出力', '出力中...');
    saveButton.disabled = true;
    cancelButton.disabled = true;
    showStatusMessage(
      statusMessage,
      '保存済みの設定内容で設計書を生成しています。',
      'info'
    );

    try {
      const result = await exporter.exportDesignDocument(savedConfig);
      showStatusMessage(
        statusMessage,
        '設計書を出力しました。ファイル名: ' + result.fileName,
        'success'
      );
    } catch (error) {
      console.error(error);
      showStatusMessage(
        statusMessage,
        '設計書の出力に失敗しました。詳細はブラウザのコンソールを確認してください。',
        'error'
      );
    } finally {
      setButtonBusy(exportButton, false, '保存済み設定で出力', '出力中...');
      saveButton.disabled = false;
      cancelButton.disabled = false;
    }
  });

  cancelButton.addEventListener('click', () => {
    // 未保存の変更は破棄し、プラグイン一覧へ戻る。
    window.location.href = '/k/admin/app/' + appId + '/plugin/';
  });
})(kintone.$PLUGIN_ID);
