((PLUGIN_ID) => {
  'use strict';

  const LEGACY_DOCUMENT_TITLE_PREFIX = 'kintone App Design Document';

  // プラグイン設定が未保存でも動作できるよう、実行時の既定値を持っておく。
  const DEFAULT_CONFIG = {
    documentTitlePrefix: 'kintoneアプリ設計書',
    outputFilePrefix: 'kintone-design-doc',
    settingsScope: 'live',
    includeRawJson: true,
    includePermissions: true,
    includeNotifications: true,
    includeCustomization: true,
    includeAdminNotes: true
  };

  // 以降は HTML 文字列を組み立てる場面が多いため、
  // まずは最低限のエスケープ用ヘルパーを定義しておく。
  const escapeHtml = (value) =>
    String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  // 設計書上では「はい / いいえ」表記で統一する。
  const formatBoolean = (value) => (value ? 'はい' : 'いいえ');

  // コード値は見分けやすいように <code> で囲んで表示する。
  const code = (value) => '<code>' + escapeHtml(value || '-') + '</code>';

  // 値が空ならダッシュで埋め、表の見た目をそろえる。
  const textOrDash = (value) => {
    if (value === undefined || value === null || value === '') {
      return '-';
    }
    return escapeHtml(value);
  };

  // 改行を含む値は <br> に変換して、そのまま表や本文へ流し込めるようにする。
  const multilineOrDash = (value) => {
    if (value === undefined || value === null || value === '') {
      return '-';
    }
    return escapeHtml(value).replace(/\n/g, '<br>');
  };

  const renderRichTextOrDash = (value) => {
    if (value === undefined || value === null || value === '') {
      return '-';
    }

    const allowedTags = {
      A: true,
      B: true,
      BR: true,
      DIV: true,
      EM: true,
      I: true,
      LI: true,
      OL: true,
      P: true,
      SPAN: true,
      STRONG: true,
      U: true,
      UL: true
    };

    const renderNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return escapeHtml(node.textContent);
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const tagName = node.tagName.toUpperCase();
      const children = Array.from(node.childNodes).map(renderNode).join('');

      if (!allowedTags[tagName]) {
        return children;
      }

      if (tagName === 'BR') {
        return '<br>';
      }

      if (tagName === 'A') {
        const href = node.getAttribute('href') || '';
        const isSafeHref = /^(https?:|mailto:)/i.test(href);
        const hrefAttribute = isSafeHref
          ? ' href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer"'
          : '';
        return '<a' + hrefAttribute + '>' + children + '</a>';
      }

      return '<' + tagName.toLowerCase() + '>' + children + '</' + tagName.toLowerCase() + '>';
    };

    const template = document.createElement('template');
    template.innerHTML = String(value);
    const html = Array.from(template.content.childNodes).map(renderNode).join('');
    return html || '-';
  };

  // Raw JSON 表示用の整形済み文字列。
  const toPrettyJson = (value) => escapeHtml(JSON.stringify(value, null, 2));

  // 想定外の undefined / object が来ても配列として扱えるように吸収する。
  const toArray = (value) => (Array.isArray(value) ? value : []);

  // プラグイン設定は文字列で返る場合があるため、boolean に正規化する。
  const readBoolean = (value, fallbackValue) => {
    if (value === undefined || value === null) {
      return fallbackValue;
    }
    return value === true || value === 'true';
  };

  // 保存済み設定を読み込み、HTMLタイトルや出力ファイル名に使えるよう整形する。
  const normalizeConfig = (savedConfig) => {
    const raw = savedConfig || {};
    const settingsScope =
      raw.settingsScope === 'preview' ? 'preview' : DEFAULT_CONFIG.settingsScope;

    const documentTitlePrefix = String(
      raw.documentTitlePrefix || DEFAULT_CONFIG.documentTitlePrefix
    ).trim();

    const outputFilePrefix = String(
      raw.outputFilePrefix || DEFAULT_CONFIG.outputFilePrefix
    )
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return {
      documentTitlePrefix:
        documentTitlePrefix && documentTitlePrefix !== LEGACY_DOCUMENT_TITLE_PREFIX
          ? documentTitlePrefix
          : DEFAULT_CONFIG.documentTitlePrefix,
      outputFilePrefix: outputFilePrefix || DEFAULT_CONFIG.outputFilePrefix,
      settingsScope: settingsScope,
      includeRawJson: readBoolean(
        raw.includeRawJson,
        DEFAULT_CONFIG.includeRawJson
      ),
      includePermissions: readBoolean(
        raw.includePermissions,
        DEFAULT_CONFIG.includePermissions
      ),
      includeNotifications: readBoolean(
        raw.includeNotifications,
        DEFAULT_CONFIG.includeNotifications
      ),
      includeCustomization: readBoolean(
        raw.includeCustomization,
        DEFAULT_CONFIG.includeCustomization
      ),
      includeAdminNotes: readBoolean(
        raw.includeAdminNotes,
        DEFAULT_CONFIG.includeAdminNotes
      )
    };
  };

  // ダウンロードファイル名に使うため、秒まで含めたタイムスタンプ文字列を作る。
  const timestampForFile = () => {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return (
      String(now.getFullYear()) +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      '_' +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds())
    );
  };

  // kintone API のエラーオブジェクトを、人が読める最小限の形へ寄せる。
  // セクション単位で失敗を握りつぶさず、設計書内に表示できるようにする。
  const simplifyApiError = (error) => {
    const detail =
      (error && (error.message || error.code)) ||
      'Failed to retrieve section data.';
    return {
      message: detail,
      code: error && error.code ? error.code : '',
      errors: error && error.errors ? error.errors : null
    };
  };

  // GET 専用の薄いラッパー。
  // Promise 化しておくと、collectResults() でまとめて await しやすい。
  const apiGet = (path, params) =>
    new Promise((resolve, reject) => {
      kintone.api(kintone.api.url(path, true), 'GET', params, resolve, reject);
    });

  // 「本番反映済み」と「プレビュー」の切り替えは、URL の /preview/ 差し替えで吸収する。
  const previewPath = (path, usePreview) => {
    if (!usePreview) {
      return path;
    }
    return path.replace('/k/v1/', '/k/v1/preview/');
  };

  // API ごとの成功/失敗を sectionResult 形式にそろえる。
  // 一部APIだけ失敗しても、設計書全体の出力は続行できるようにしている。
  const collectSection = async (title, action) => {
    try {
      return {
        ok: true,
        title: title,
        data: await action()
      };
    } catch (error) {
      return {
        ok: false,
        title: title,
        error: simplifyApiError(error)
      };
    }
  };

  // 権限や通知で出てくる主体を、人が読みやすい 1 行表記へ寄せる。
  const entityLabel = (entity, includeSubs) => {
    const type = entity && entity.type ? entity.type : '不明';
    const entityCode =
      entity && entity.code !== undefined && entity.code !== null && entity.code !== ''
        ? entity.code
        : '（なし）';

    return (
      escapeHtml(type + ': ' + entityCode) +
      (includeSubs ? ' <span class="muted">（下位組織を含む）</span>' : '')
    );
  };

  // 配列を縦並び表示したい箇所で共通利用する。
  const listAsLines = (items) => {
    if (!items || items.length === 0) {
      return '-';
    }
    return items.join('<br>');
  };

  // このファイルのほとんどの表はここを通る。
  // 必要に応じてテーブルごとの class や colgroup も差し込めるようにしている。
  const renderTable = (headers, rows, options) => {
    if (!rows || rows.length === 0) {
      return '<p class="muted">データはありません。</p>';
    }

    const tableOptions = options || {};
    const tableClassName = tableOptions.tableClassName
      ? ' ' + tableOptions.tableClassName
      : '';
    const wrapClassName = tableOptions.wrapClassName
      ? ' ' + tableOptions.wrapClassName
      : '';
    const colWidths = toArray(tableOptions.colWidths);
    const colgroup = colWidths.length
      ? '<colgroup>' +
        colWidths
          .map((width) => '<col style="width:' + escapeHtml(width) + ';">')
          .join('') +
        '</colgroup>'
      : '';

    return (
      '<div class="table-wrap' +
      wrapClassName +
      '"><table class="' +
      tableClassName.trim() +
      '">' +
      colgroup +
      '<thead><tr>' +
      headers.map((header) => '<th>' + escapeHtml(header) + '</th>').join('') +
      '</tr></thead><tbody>' +
      rows
        .map(
          (row) =>
            '<tr>' + row.map((cell) => '<td>' + cell + '</td>').join('') + '</tr>'
        )
        .join('') +
      '</tbody></table></div>'
    );
  };

  // 取得失敗したセクションは、設計書内で明示的なエラーカードとして表示する。
  const renderErrorCard = (sectionResult) => {
    return (
      '<div class="error-card">' +
      '<strong>' +
      escapeHtml(sectionResult.title) +
      ':</strong> ' +
      escapeHtml(sectionResult.error.message) +
      (sectionResult.error.code
        ? ' <span class="muted">[' + escapeHtml(sectionResult.error.code) + ']</span>'
        : '') +
      '</div>'
    );
  };

  // 必要な場合だけ Raw JSON を折りたたみ表示にする。
  const renderRawJson = (sectionResult, includeRawJson) => {
    if (!includeRawJson || !sectionResult || !sectionResult.ok) {
      return '';
    }

    return (
      '<details class="raw-json">' +
      '<summary>生データ (JSON)</summary>' +
      '<pre>' +
      toPrettyJson(sectionResult.data) +
      '</pre>' +
      '</details>'
    );
  };

  // フィールドAPIは入れ子構造を持つため、
  // テーブルやグループ内の子フィールドも 1 行ずつフラットに展開する。
  const flattenFields = (properties, parentCode) => {
    const rows = [];
    Object.keys(properties || {}).forEach((fieldCode) => {
      const field = properties[fieldCode];
      rows.push({
        label: field.label || '',
        code: field.code || fieldCode,
        type: field.type || '',
        parentCode: parentCode || '',
        required: field.required,
        unique: field.unique,
        defaultValue: field.defaultValue,
        options: field.options,
        details: field
      });

      if (field.fields) {
        Array.prototype.push.apply(
          rows,
          flattenFields(field.fields, field.code || fieldCode)
        );
      }
    });
    return rows;
  };

  // 選択肢は API によって配列だったり連想オブジェクトだったりするので両対応にする。
  const renderFieldOptions = (options) => {
    if (!options) {
      return '-';
    }

    if (Array.isArray(options)) {
      return options.map((option) => escapeHtml(option)).join('<br>') || '-';
    }

    const values = Object.keys(options)
      .map((key) => options[key])
      .sort((left, right) => {
        const leftIndex = Number(left && left.index !== undefined ? left.index : 0);
        const rightIndex = Number(
          right && right.index !== undefined ? right.index : 0
        );
        return leftIndex - rightIndex;
      })
      .map((option) => {
        const label = option && option.label ? option.label : '';
        return escapeHtml(label);
      });

    return values.join('<br>') || '-';
  };

  // よく使う補足情報だけを抜き出し、フィールド一覧の詳細列に詰める。
  const renderFieldDetails = (field) => {
    const details = [];

    if (field.noLabel) {
      details.push('ラベルなし');
    }
    if (field.maxLength !== undefined) {
      details.push('最大文字数: ' + field.maxLength);
    }
    if (field.minLength !== undefined) {
      details.push('最小文字数: ' + field.minLength);
    }
    if (field.maxValue !== undefined) {
      details.push('最大値: ' + field.maxValue);
    }
    if (field.minValue !== undefined) {
      details.push('最小値: ' + field.minValue);
    }
    if (field.expression) {
      details.push('計算式: ' + field.expression);
    }
    if (field.unit) {
      details.push(
        '単位: ' + field.unit + ' (' + (field.unitPosition || 'AFTER') + ')'
      );
    }
    if (field.align) {
      details.push('配置: ' + field.align);
    }
    if (field.lookup) {
      details.push('ルックアップあり');
    }
    if (field.referenceTable) {
      details.push('関連レコード一覧');
    }
    if (field.fields) {
      details.push('子フィールドあり');
    }

    return details.length
      ? details.map((detail) => escapeHtml(detail)).join('<br>')
      : '-';
  };

  // フィールド一覧セクション。
  const renderFieldsSection = (sectionResult, includeRawJson) => {
    if (!sectionResult.ok) {
      return renderErrorCard(sectionResult);
    }

    const fields = flattenFields(sectionResult.data.properties || {});
    const rows = fields.map((field) => [
      textOrDash(field.label),
      code(field.code),
      code(field.type),
      field.parentCode ? code(field.parentCode) : '-',
      escapeHtml(formatBoolean(field.required)),
      escapeHtml(formatBoolean(field.unique)),
      multilineOrDash(
        Array.isArray(field.defaultValue)
          ? field.defaultValue.join(', ')
          : field.defaultValue
      ),
      renderFieldOptions(field.options),
      renderFieldDetails(field.details)
    ]);

    return (
      renderTable(
        [
          '項目名',
          'フィールドコード',
          '型',
          '親フィールド',
          '必須',
          '重複禁止',
          '初期値',
          '選択肢',
          '詳細'
        ],
        rows,
        {
          tableClassName: 'table--fields',
          wrapClassName: 'table-wrap--fields',
          colWidths: ['14%', '16%', '14%', '10%', '7%', '7%', '10%', '10%', '12%']
        }
      ) + renderRawJson(sectionResult, includeRawJson)
    );
  };

  // ルックアップや関連レコード一覧の参照先アプリ情報を読みやすくまとめる。
  const renderRelatedApp = (relatedApp) => {
    if (!relatedApp) {
      return '-';
    }

    const lines = [];
    if (relatedApp.app !== undefined && relatedApp.app !== null) {
      lines.push('アプリID: ' + code(relatedApp.app));
    }
    if (relatedApp.code) {
      lines.push('アプリコード: ' + code(relatedApp.code));
    }
    return listAsLines(lines);
  };

  // フィールド同士の対応関係は「自アプリ側 ← 参照先側」で表す。
  const renderFieldPair = (fieldCode, relatedFieldCode) => {
    return code(fieldCode || '-') + ' ← ' + code(relatedFieldCode || '-');
  };

  const renderLookupMapping = (lookup) => {
    const mappings = toArray(lookup && lookup.fieldMappings).map((mapping) =>
      renderFieldPair(mapping.field, mapping.relatedField)
    );

    return listAsLines(mappings);
  };

  const renderLookupPickerFields = (lookup) => {
    return listAsLines(
      toArray(lookup && lookup.lookupPickerFields).map((fieldCode) =>
        code(fieldCode)
      )
    );
  };

  // フィールド定義から、他アプリとの関係性だけを抜き出す。
  const collectExternalAppRelations = (properties) => {
    const fields = flattenFields(properties || {});
    const relations = [];

    fields.forEach((field) => {
      if (field.details && field.details.lookup) {
        const lookup = field.details.lookup;
        relations.push({
          type: 'ルックアップ',
          label: field.label,
          code: field.code,
          relatedApp: lookup.relatedApp,
          key: renderFieldPair(field.code, lookup.relatedKeyField),
          items: renderLookupMapping(lookup),
          pickerFields: renderLookupPickerFields(lookup),
          filterCond: lookup.filterCond,
          sort: lookup.sort
        });
      }

      if (field.details && field.details.referenceTable) {
        const referenceTable = field.details.referenceTable;
        const condition = referenceTable.condition || {};
        relations.push({
          type: '関連レコード一覧',
          label: field.label,
          code: field.code,
          relatedApp: referenceTable.relatedApp,
          key: renderFieldPair(condition.field, condition.relatedField),
          items: listAsLines(
            toArray(referenceTable.displayFields).map((fieldCode) =>
              code(fieldCode)
            )
          ),
          pickerFields: '-',
          filterCond: referenceTable.filterCond,
          sort: referenceTable.sort
        });
      }
    });

    return relations;
  };

  // 他アプリとの関係性を独立セクションとして表示する。
  const renderExternalAppRelationsSection = (sectionResult) => {
    if (!sectionResult.ok) {
      return renderErrorCard(sectionResult);
    }

    const relations = collectExternalAppRelations(
      sectionResult.data.properties || {}
    );
    const rows = relations.map((relation) => [
      textOrDash(relation.type),
      textOrDash(relation.label) + '<br>' + code(relation.code),
      renderRelatedApp(relation.relatedApp),
      relation.key,
      relation.items,
      relation.pickerFields,
      multilineOrDash(relation.filterCond),
      multilineOrDash(relation.sort)
    ]);

    return renderTable(
      [
        '種別',
        'フィールド',
        '参照先アプリ',
        'キー / 条件',
        'コピー / 表示項目',
        '取得時の表示項目',
        '絞り込み条件',
        'ソート'
      ],
      rows,
      {
        tableClassName: 'table--relations',
        wrapClassName: 'table-wrap--relations',
        colWidths: ['11%', '15%', '14%', '15%', '16%', '12%', '9%', '8%']
      }
    );
  };

  // レイアウトツリーの各ノードに表示するラベルを作る。
  const layoutItemLabel = (item) => {
    if (item.type === 'ROW') {
      return toArray(item.fields)
        .map((field) => {
          const name = field.label || field.code || field.elementId || '（名称なし）';
          const width =
            field.size && field.size.width ? ' [' + field.size.width + 'px]' : '';
          return escapeHtml(name + ' <' + field.type + '>' + width);
        })
        .join(' | ');
    }

    if (item.type === 'GROUP') {
      return escapeHtml((item.code || '（グループ）') + ' <GROUP>');
    }

    if (item.type === 'SUBTABLE') {
      return escapeHtml((item.code || '（テーブル）') + ' <SUBTABLE>');
    }

    return escapeHtml(item.type || '不明');
  };

  // GROUP や SUBTABLE の子要素を再帰描画しやすい形で返す。
  const layoutChildren = (item) => {
    if (item.type === 'GROUP') {
      return toArray(item.layout);
    }
    if (item.type === 'SUBTABLE') {
      return item.fields && item.fields.length
        ? [
            {
              type: 'ROW',
              fields: item.fields
            }
          ]
        : [];
    }
    return [];
  };

  // レイアウトは表より木構造のほうが追いやすいため、入れ子の <ul> で描画する。
  const renderLayoutTree = (items) => {
    if (!items || items.length === 0) {
      return '<p class="muted">レイアウト情報はありません。</p>';
    }

    return (
      '<ul class="layout-tree">' +
      items
        .map((item) => {
          const children = layoutChildren(item);
          return (
            '<li>' +
            '<div class="layout-node">' +
            '<span class="node-type">' +
            escapeHtml(item.type || '不明') +
            '</span>' +
            '<span class="node-text">' +
            layoutItemLabel(item) +
            '</span>' +
            '</div>' +
            (children.length ? renderLayoutTree(children) : '') +
            '</li>'
          );
        })
        .join('') +
      '</ul>'
    );
  };

  // レイアウトセクション。
  const renderLayoutSection = (sectionResult, includeRawJson) => {
    if (!sectionResult.ok) {
      return renderErrorCard(sectionResult);
    }

    return (
      renderLayoutTree(sectionResult.data.layout || []) +
      renderRawJson(sectionResult, includeRawJson)
    );
  };

  // 一覧設定セクション。
  const renderViewsSection = (sectionResult, includeRawJson) => {
    if (!sectionResult.ok) {
      return renderErrorCard(sectionResult);
    }

    const views = Object.keys(sectionResult.data.views || {})
      .map((viewName) => sectionResult.data.views[viewName])
      .sort((left, right) => Number(left.index || 0) - Number(right.index || 0));

    const rows = views.map((view) => [
      textOrDash(view.name),
      code(view.id),
      textOrDash(view.type),
      listAsLines(
        toArray(view.fields).map((fieldCode) => code(fieldCode))
      ),
      multilineOrDash(view.filterCond),
      multilineOrDash(view.sort),
      escapeHtml(formatBoolean(view.pager))
    ]);

    return (
      renderTable(
        ['一覧名', 'ID', '表示形式', '表示項目', '絞り込み条件', 'ソート', 'ページャー'],
        rows
      ) + renderRawJson(sectionResult, includeRawJson)
    );
  };

  // プロセス管理は「有効/無効」「状態」「アクション」の順で読むと理解しやすい。
  const renderProcessSection = (sectionResult, includeRawJson) => {
    if (!sectionResult.ok) {
      return renderErrorCard(sectionResult);
    }

    const data = sectionResult.data;
    let html =
      renderTable(
        ['項目', '内容'],
        [
          ['有効', escapeHtml(formatBoolean(data.enable))],
          ['リビジョン', code(data.revision)]
        ]
      ) + '<div class="spacer"></div>';

    if (!data.enable || !data.states) {
      html += '<p class="muted">プロセス管理は無効です。</p>';
      html += renderRawJson(sectionResult, includeRawJson);
      return html;
    }

    const states = Object.keys(data.states)
      .map((statusName) => data.states[statusName])
      .sort((left, right) => Number(left.index || 0) - Number(right.index || 0));

    const stateRows = states.map((state) => [
      textOrDash(state.name),
      code(state.index),
      textOrDash(state.assignee && state.assignee.type),
      listAsLines(
        toArray(state.assignee && state.assignee.entities).map((entityConfig) =>
          entityLabel(entityConfig.entity, entityConfig.includeSubs)
        )
      )
    ]);

    const actionRows = toArray(data.actions).map((action) => [
      textOrDash(action.name),
      code(action.from),
      code(action.to),
      multilineOrDash(action.filterCond)
    ]);

    html += '<h3>ステータス</h3>';
    html += renderTable(
      ['名前', '順序', '作業者タイプ', '作業者'],
      stateRows
    );
    html += '<h3>アクション</h3>';
    html += renderTable(['アクション名', '遷移元', '遷移先', '条件'], actionRows);
    html += renderRawJson(sectionResult, includeRawJson);
    return html;
  };

  // 以降は権限関連の描画。
  const renderAppPermissionsTable = (sectionResult) => {
    if (!sectionResult.ok) {
      return renderErrorCard(sectionResult);
    }

    const rows = toArray(sectionResult.data.rights).map((right) => [
      entityLabel(right.entity, right.includeSubs),
      escapeHtml(formatBoolean(right.appEditable)),
      escapeHtml(formatBoolean(right.recordViewable)),
      escapeHtml(formatBoolean(right.recordAddable)),
      escapeHtml(formatBoolean(right.recordEditable)),
      escapeHtml(formatBoolean(right.recordDeletable)),
      escapeHtml(formatBoolean(right.recordImportable)),
      escapeHtml(formatBoolean(right.recordExportable))
    ]);

    return renderTable(
      [
        '対象',
        'アプリ管理',
        '閲覧',
        '追加',
        '編集',
        '削除',
        '読み込み',
        '書き出し'
      ],
      rows
    );
  };

  const renderRecordPermissionsTable = (sectionResult) => {
    if (!sectionResult.ok) {
      return renderErrorCard(sectionResult);
    }

    const rows = toArray(sectionResult.data.rights).map((right) => [
      multilineOrDash(right.filterCond),
      listAsLines(
        toArray(right.entities).map((entityConfig) => {
          const flags = [
            '閲覧=' + formatBoolean(entityConfig.viewable),
            '編集=' + formatBoolean(entityConfig.editable),
            '削除=' + formatBoolean(entityConfig.deletable)
          ];

          return (
            entityLabel(entityConfig.entity, entityConfig.includeSubs) +
            '<br><span class="muted">' +
            escapeHtml(flags.join(', ')) +
            '</span>'
          );
        })
      )
    ]);

    return renderTable(['条件', '対象'], rows);
  };

  const renderFieldPermissionsTable = (sectionResult) => {
    if (!sectionResult.ok) {
      return renderErrorCard(sectionResult);
    }

    const rows = toArray(sectionResult.data.rights).map((right) => [
      code(right.code),
      listAsLines(
        toArray(right.entities).map((entityConfig) => {
          return (
            entityLabel(entityConfig.entity, entityConfig.includeSubs) +
            '<br><span class="muted">' +
            escapeHtml('権限=' + entityConfig.accessibility) +
            '</span>'
          );
        })
      )
    ]);

    return renderTable(['フィールドコード', '対象'], rows);
  };

  // 権限は API が 3 種類に分かれるため、見出し付きで 1 セクションに束ねる。
  const renderPermissionsSection = (sections, includeRawJson) => {
    let html = '<h3>アプリ権限</h3>' + renderAppPermissionsTable(sections.app);
    html += '<h3>レコード権限</h3>' + renderRecordPermissionsTable(sections.record);
    html += '<h3>フィールド権限</h3>' + renderFieldPermissionsTable(sections.field);
    html += renderRawJson(sections.app, includeRawJson);
    html += renderRawJson(sections.record, includeRawJson);
    html += renderRawJson(sections.field, includeRawJson);
    return html;
  };

  // 以降は通知関連の描画。
  const renderGeneralNotificationTable = (sectionResult) => {
    if (!sectionResult.ok) {
      return renderErrorCard(sectionResult);
    }

    const rows = toArray(sectionResult.data.notifications).map((notification) => [
      entityLabel(notification.entity, notification.includeSubs),
      escapeHtml(formatBoolean(notification.recordAdded)),
      escapeHtml(formatBoolean(notification.recordEdited)),
      escapeHtml(formatBoolean(notification.commentAdded)),
      escapeHtml(formatBoolean(notification.statusChanged)),
      escapeHtml(formatBoolean(notification.fileImported))
    ]);

    return (
      renderTable(
        [
          '通知先',
          'レコード追加',
          'レコード編集',
          'コメント追加',
          'ステータス変更',
          'ファイル読み込み'
        ],
        rows
      ) +
      '<p class="muted">コメント投稿者にも通知: ' +
      escapeHtml(formatBoolean(sectionResult.data.notifyToCommenter)) +
      '</p>'
    );
  };

  // 条件通知は対象条件と通知先を中心に整理する。
  const renderPerRecordNotificationTable = (sectionResult) => {
    if (!sectionResult.ok) {
      return renderErrorCard(sectionResult);
    }

    const rows = toArray(sectionResult.data.notifications).map((notification) => [
      multilineOrDash(notification.title),
      multilineOrDash(notification.filterCond),
      listAsLines(
        toArray(notification.targets).map((target) =>
          entityLabel(target.entity, target.includeSubs)
        )
      )
    ]);

    return renderTable(['タイトル', '条件', '通知先'], rows);
  };

  // リマインダー通知は timing が分解されて返るため、1 行文字列へ要約する。
  const renderReminderNotificationTable = (sectionResult) => {
    if (!sectionResult.ok) {
      return renderErrorCard(sectionResult);
    }

    const rows = toArray(sectionResult.data.notifications).map((notification) => {
      const timing = notification.timing || {};
      const timingSummary = [
        timing.code ? '対象フィールド=' + timing.code : '',
        timing.daysLater !== undefined ? '日数=' + timing.daysLater : '',
        timing.hoursLater !== undefined ? '時間差=' + timing.hoursLater : '',
        timing.time ? '時刻=' + timing.time : ''
      ]
        .filter(Boolean)
        .join(', ');

      return [
        multilineOrDash(notification.title),
        multilineOrDash(timingSummary),
        multilineOrDash(notification.filterCond),
        listAsLines(
          toArray(notification.targets).map((target) =>
            entityLabel(target.entity, target.includeSubs)
          )
        )
      ];
    });

    return (
      renderTable(['タイトル', '通知タイミング', '条件', '通知先'], rows) +
      '<p class="muted">リマインダーのタイムゾーン: ' +
      escapeHtml(sectionResult.data.timezone || '-') +
      '</p>'
    );
  };

  // 通知も 3 API をまとめて 1 セクションとして出力する。
  const renderNotificationsSection = (sections, includeRawJson) => {
    let html =
      '<h3>一般通知</h3>' +
      renderGeneralNotificationTable(sections.general);
    html +=
      '<h3>条件通知</h3>' +
      renderPerRecordNotificationTable(sections.perRecord);
    html +=
      '<h3>リマインダー通知</h3>' +
      renderReminderNotificationTable(sections.reminder);
    html += renderRawJson(sections.general, includeRawJson);
    html += renderRawJson(sections.perRecord, includeRawJson);
    html += renderRawJson(sections.reminder, includeRawJson);
    return html;
  };

  // JS/CSS カスタマイズのファイル一覧を共通形式で描画する。
  const renderCustomizationFiles = (items) => {
    return renderTable(
      ['種別', '登録元', '名前 / URL', 'サイズ'],
      toArray(items).map((item) => [
        textOrDash(item.type),
        item.type === 'FILE' ? 'アップロードファイル' : 'URL',
        item.type === 'FILE'
          ? textOrDash(item.file && item.file.name)
          : multilineOrDash(item.url),
        item.type === 'FILE' ? textOrDash(item.file && item.file.size) : '-'
      ])
    );
  };

  // カスタマイズ設定とアプリに導入済みプラグイン一覧を並べて出す。
  const renderCustomizationSection = (sections, includeRawJson) => {
    let html = '';

    if (!sections.customization.ok) {
      html += renderErrorCard(sections.customization);
    } else {
      const customization = sections.customization.data;
      html += renderTable(
        ['項目', '内容'],
        [
          ['対象範囲', textOrDash(customization.scope)],
          ['リビジョン', code(customization.revision)]
        ]
      );
      html += '<h3>PC用 JavaScript</h3>';
      html += renderCustomizationFiles(customization.desktop && customization.desktop.js);
      html += '<h3>PC用 CSS</h3>';
      html += renderCustomizationFiles(customization.desktop && customization.desktop.css);
      html += '<h3>モバイル用 JavaScript</h3>';
      html += renderCustomizationFiles(customization.mobile && customization.mobile.js);
      html += '<h3>モバイル用 CSS</h3>';
      html += renderCustomizationFiles(customization.mobile && customization.mobile.css);
    }

    html += '<h3>利用中のプラグイン</h3>';
    if (!sections.plugins.ok) {
      html += renderErrorCard(sections.plugins);
    } else {
      html += renderTable(
        ['名前', 'ID', '有効'],
        toArray(sections.plugins.data.plugins).map((plugin) => [
          textOrDash(plugin.name),
          code(plugin.id),
          escapeHtml(formatBoolean(plugin.enabled))
        ])
      );
    }

    html += renderRawJson(sections.customization, includeRawJson);
    html += renderRawJson(sections.plugins, includeRawJson);
    return html;
  };

  // アプリ管理者メモは文章主体なので、表 + 本文ブロックで表示する。
  const renderAdminNotesSection = (sectionResult, includeRawJson) => {
    if (!sectionResult.ok) {
      return renderErrorCard(sectionResult);
    }

    return (
      renderTable(
        ['項目', '内容'],
        [
          ['テンプレートやアプリ複製に含める', textOrDash(formatBoolean(sectionResult.data.includeInTemplateAndDuplicates))],
          ['リビジョン', code(sectionResult.data.revision)]
        ]
      ) +
      '<div class="notes-block">' +
      renderRichTextOrDash(sectionResult.data.content) +
      '</div>' +
      renderRawJson(sectionResult, includeRawJson)
    );
  };

  const renderAppPurposeSection = (sectionResult) => {
    if (!sectionResult.ok) {
      return renderErrorCard(sectionResult);
    }

    return (
      '<div class="purpose-block">' +
      renderRichTextOrDash(sectionResult.data.content) +
      '</div>'
    );
  };

  // Summary セクションは、複数 API から拾った主要メタ情報を 1 箇所に集約する。
  const renderSummarySection = (results, config) => {
    const appInfo = results.appInfo.ok ? results.appInfo.data : {};
    const generalSettings = results.generalSettings.ok
      ? results.generalSettings.data
      : {};
    const loginUser = kintone.getLoginUser ? kintone.getLoginUser() : {};

    return renderTable(
      ['項目', '内容'],
      [
        ['アプリID', code(appInfo.appId || kintone.app.getId())],
        ['アプリ名', textOrDash(generalSettings.name || appInfo.name)],
        ['アプリコード', code(appInfo.code || '-')],
        ['説明', multilineOrDash(generalSettings.description)],
        ['リビジョン', code(generalSettings.revision || '-')],
        ['スペースID', code(appInfo.spaceId || '-')],
        ['スレッドID', code(appInfo.threadId || '-')],
        ['作成者', textOrDash(appInfo.creator && appInfo.creator.name)],
        ['更新者', textOrDash(appInfo.modifier && appInfo.modifier.name)],
        [
          '出力者',
          textOrDash(loginUser && (loginUser.name || loginUser.code || loginUser.id))
        ],
        ['取得対象', textOrDash(config.settingsScope === 'preview' ? 'プレビュー設定' : '本番反映済み設定')],
        [
          'テスト環境',
          textOrDash(kintone.app.isTestEnvironment && kintone.app.isTestEnvironment())
        ],
        [
          'メンテナンスモード',
          textOrDash(kintone.app.isMaintenanceMode && kintone.app.isMaintenanceMode())
        ],
        ['出力日時', textOrDash(new Date().toLocaleString())]
      ],
      {
        tableClassName: 'table--summary',
        wrapClassName: 'table-wrap--summary',
        colWidths: ['180px', 'auto']
      }
    );
  };

  // 実際の API 収集処理。
  // include* の設定に応じて必要な API だけを Promise で積み上げ、
  // 最後に key ごとのオブジェクトへ戻している。
  const collectResults = async (appId, config) => {
    const usePreview = config.settingsScope === 'preview';
    const tasks = {
      appInfo: collectSection('アプリ基本情報', () =>
        apiGet('/k/v1/app.json', { id: appId })
      ),
      generalSettings: collectSection('一般設定', () =>
        apiGet(previewPath('/k/v1/app/settings.json', usePreview), { app: appId })
      ),
      formFields: collectSection('フォーム項目', () =>
        apiGet(previewPath('/k/v1/app/form/fields.json', usePreview), { app: appId })
      ),
      formLayout: collectSection('フォームレイアウト', () =>
        apiGet(previewPath('/k/v1/app/form/layout.json', usePreview), { app: appId })
      ),
      views: collectSection('一覧設定', () =>
        apiGet(previewPath('/k/v1/app/views.json', usePreview), { app: appId })
      ),
      processManagement: collectSection('プロセス管理', () =>
        apiGet(previewPath('/k/v1/app/status.json', usePreview), {
          app: appId,
          lang: 'user'
        })
      )
    };

    if (config.includePermissions) {
      tasks.appPermissions = collectSection('アプリ権限', () =>
        apiGet(previewPath('/k/v1/app/acl.json', usePreview), { app: appId })
      );
      tasks.recordPermissions = collectSection('レコード権限', () =>
        apiGet(previewPath('/k/v1/record/acl.json', usePreview), { app: appId })
      );
      tasks.fieldPermissions = collectSection('フィールド権限', () =>
        apiGet(previewPath('/k/v1/field/acl.json', usePreview), { app: appId })
      );
    }

    if (config.includeNotifications) {
      tasks.generalNotifications = collectSection('一般通知', () =>
        apiGet(
          previewPath('/k/v1/app/notifications/general.json', usePreview),
          { app: appId }
        )
      );
      tasks.perRecordNotifications = collectSection(
        '条件通知',
        () =>
          apiGet(
            previewPath('/k/v1/app/notifications/perRecord.json', usePreview),
            { app: appId, lang: 'user' }
          )
      );
      tasks.reminderNotifications = collectSection('リマインダー通知', () =>
        apiGet(
          previewPath('/k/v1/app/notifications/reminder.json', usePreview),
          { app: appId, lang: 'user' }
        )
      );
    }

    if (config.includeCustomization) {
      tasks.customization = collectSection('カスタマイズ', () =>
        apiGet(previewPath('/k/v1/app/customize.json', usePreview), { app: appId })
      );
      tasks.plugins = collectSection('利用中のプラグイン', () =>
        apiGet(previewPath('/k/v1/app/plugins.json', usePreview), { app: appId })
      );
    }

    tasks.adminNotes = collectSection('アプリ管理者メモ', () =>
      apiGet(previewPath('/k/v1/app/adminNotes.json', usePreview), { app: appId })
    );

    const entries = await Promise.all(
      Object.keys(tasks).map(async (key) => [key, await tasks[key]])
    );

    const results = {};
    entries.forEach((entry) => {
      results[entry[0]] = entry[1];
    });
    return results;
  };

  // 一部セクションが失敗しても、先頭にまとめて注意を出して気づけるようにする。
  const renderErrorSummary = (results) => {
    const failures = Object.keys(results)
      .map((key) => results[key])
      .filter((sectionResult) => !sectionResult.ok);

    if (!failures.length) {
      return '';
    }

    return (
      '<section class="notice warning"><h2>取得できなかった項目</h2><ul>' +
      failures
        .map(
          (failure) =>
            '<li><strong>' +
            escapeHtml(failure.title) +
            ':</strong> ' +
            escapeHtml(failure.error.message) +
            (failure.error.code
              ? ' [' + escapeHtml(failure.error.code) + ']'
              : '') +
            '</li>'
        )
        .join('') +
      '</ul></section>'
    );
  };

  const buildDocumentSections = (config) => {
    const sections = [
      { id: 'app-purpose', title: 'このアプリの目的' },
      { id: 'summary', title: 'サマリー' },
      { id: 'fields', title: 'フィールド一覧' },
      { id: 'external-relations', title: '他アプリ連携' },
      { id: 'layout', title: 'レイアウト' },
      { id: 'views', title: '一覧設定' },
      { id: 'process', title: 'プロセス管理' }
    ];

    if (config.includePermissions) {
      sections.push({ id: 'permissions', title: '権限' });
    }

    if (config.includeNotifications) {
      sections.push({ id: 'notifications', title: '通知' });
    }

    if (config.includeCustomization) {
      sections.push({ id: 'customization', title: 'カスタマイズ' });
    }

    if (config.includeAdminNotes) {
      sections.push({ id: 'admin-notes', title: 'アプリ管理者メモ' });
    }

    return sections;
  };

  const renderTableOfContents = (sections) =>
    '<section class="toc" aria-labelledby="toc-heading"><h2 id="toc-heading">目次</h2><ol>' +
    sections
      .map(
        (section) =>
          '<li><a href="#' +
          escapeHtml(section.id) +
          '">' +
          escapeHtml(section.title) +
          '</a></li>'
      )
      .join('') +
    '</ol></section>';

  // 設計書全体の HTML を 1 つの文字列として組み立てる。
  // セクションの出し分けもここで行う。
  const buildHtmlDocument = (results, config) => {
    const appId = kintone.app.getId();
    const appName =
      results.generalSettings.ok && results.generalSettings.data.name
        ? results.generalSettings.data.name
        : results.appInfo.ok && results.appInfo.data.name
          ? results.appInfo.data.name
          : 'kintone App';
    const documentSections = buildDocumentSections(config);

    let html = '';
    html += '<!doctype html><html lang="ja"><head><meta charset="utf-8">';
    html +=
      '<meta name="viewport" content="width=device-width, initial-scale=1">';
    html +=
      '<title>' +
      escapeHtml(config.documentTitlePrefix + ' - ' + appName) +
      '</title>';
    html += '<style>';
    html +=
      'body{margin:0;background:#f4f7fb;color:#1f2a36;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65;}';
    html +=
      '.page{max-width:1200px;margin:0 auto;padding:40px 24px 80px;}';
    html +=
      '.hero{padding:28px 32px;background:linear-gradient(135deg,#12344d,#1c5d7b);color:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(18,52,77,.18);}';
    html += '.hero h1{margin:0;font-size:34px;line-height:1.2;}';
    html += '.hero p{margin:10px 0 0;color:rgba(255,255,255,.84);}';
    html +=
      '.hero-meta{display:flex;flex-wrap:wrap;gap:12px;margin-top:18px;font-size:13px;}';
    html +=
      '.hero-meta span{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.12);}';
    html +=
      'section{margin-top:24px;padding:28px;background:#fff;border:1px solid #dbe5ef;border-radius:18px;box-shadow:0 10px 30px rgba(16,42,67,.05);}';
    html += 'section{scroll-margin-top:18px;}';
    html += 'h2{margin:0 0 16px;font-size:24px;line-height:1.3;}';
    html += 'h3{margin:24px 0 12px;font-size:18px;}';
    html +=
      '.notice.warning{background:#fff7e6;border-color:#f2d4a3;}';
    html +=
      '.table-wrap{overflow:auto;border:1px solid #dbe5ef;border-radius:12px;}';
    html +=
      'table{width:100%;border-collapse:collapse;min-width:720px;background:#fff;}';
    html +=
      'th,td{padding:12px 14px;border-bottom:1px solid #e7eef6;vertical-align:top;text-align:left;font-size:13px;}';
    html +=
      'th{white-space:nowrap;word-break:keep-all;}';
    html +=
      'td{word-break:normal;overflow-wrap:anywhere;}';
    html +=
      'th{background:#f7fafc;color:#36506b;font-weight:700;position:sticky;top:0;}';
    html += 'tbody tr:nth-child(even){background:#fbfdff;}';
    html += 'code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:#eef3f8;padding:2px 6px;border-radius:6px;}';
    html += 'code{display:inline-block;max-width:100%;overflow-wrap:anywhere;}';
    html += '.muted{color:#637487;}';
    html += '.toc ol{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px 18px;margin:0;padding-left:22px;}';
    html += '.toc li{padding-left:2px;}';
    html += '.toc a{color:#17405d;font-weight:700;text-decoration:none;}';
    html += '.toc a:hover{text-decoration:underline;}';
    html += '.table-wrap--summary table,.table-wrap--fields table,.table-wrap--relations table{table-layout:fixed;}';
    html += '.table--summary td:first-child{white-space:nowrap;word-break:keep-all;}';
    html += '.table--summary td:last-child{white-space:normal;}';
    html += '.table--fields th,.table--fields td:nth-child(1),.table--fields td:nth-child(4){word-break:keep-all;}';
    html += '.table--fields td:nth-child(5),.table--fields td:nth-child(6){text-align:center;}';
    html += '.table--relations td:nth-child(1){white-space:nowrap;word-break:keep-all;}';
    html += '.layout-tree{margin:0;padding-left:20px;}';
    html += '.layout-tree li{margin:10px 0;}';
    html +=
      '.layout-node{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;background:#f7fafc;border:1px solid #dbe5ef;border-radius:10px;}';
    html +=
      '.node-type{display:inline-flex;min-width:90px;justify-content:center;padding:4px 8px;border-radius:999px;background:#dce8f5;color:#17405d;font-size:12px;font-weight:700;}';
    html += '.node-text{flex:1;}';
    html +=
      '.error-card{padding:14px 16px;background:#fff6f6;border:1px solid #f1c4c4;border-radius:12px;color:#8a1f1f;}';
    html +=
      '.notes-block{margin-top:14px;padding:16px;background:#f7fafc;border:1px solid #dbe5ef;border-radius:12px;white-space:normal;}';
    html +=
      '.purpose-block{padding:16px;background:#f7fafc;border:1px solid #dbe5ef;border-radius:12px;white-space:normal;}';
    html += '.notes-block p,.notes-block div,.purpose-block p,.purpose-block div{margin:0 0 10px;}';
    html += '.notes-block p:last-child,.notes-block div:last-child,.purpose-block p:last-child,.purpose-block div:last-child{margin-bottom:0;}';
    html += '.notes-block ol,.notes-block ul,.purpose-block ol,.purpose-block ul{margin:8px 0 12px;padding-left:24px;}';
    html += '.notes-block a,.purpose-block a{color:#17405d;font-weight:700;}';
    html += '.raw-json{margin-top:16px;}';
    html +=
      '.raw-json summary{cursor:pointer;color:#17405d;font-weight:700;}';
    html +=
      '.raw-json pre{margin:12px 0 0;padding:16px;background:#101923;color:#d9e7f5;border-radius:14px;overflow:auto;font-size:12px;line-height:1.6;}';
    html += '.spacer{height:12px;}';
    html +=
      '@media print{body{background:#fff;} .page{max-width:none;padding:0;} section,.hero{box-shadow:none;border-radius:0;} .hero{background:#12344d !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}';
    html += '</style></head><body><div class="page">';
    html += '<div class="hero">';
    html +=
      '<h1>' +
      escapeHtml(config.documentTitlePrefix) +
      '</h1>';
    html +=
      '<p>' +
      escapeHtml(appName) +
      ' の設定情報をHTML設計書として出力したファイルです。</p>';
    html += '<div class="hero-meta">';
    html += '<span>アプリID: ' + escapeHtml(String(appId)) + '</span>';
    html +=
      '<span>取得対象: ' +
      escapeHtml(config.settingsScope === 'preview' ? 'プレビュー設定' : '本番反映済み設定') +
      '</span>';
    html +=
      '<span>出力日時: ' + escapeHtml(new Date().toLocaleString()) + '</span>';
    html += '</div></div>';
    html += renderErrorSummary(results);
    html += renderTableOfContents(documentSections);
    html += '<section id="app-purpose"><h2>このアプリの目的</h2>' + renderAppPurposeSection(results.adminNotes) + '</section>';
    html += '<section id="summary"><h2>サマリー</h2>' + renderSummarySection(results, config) + '</section>';
    html +=
      '<section id="fields"><h2>フィールド一覧</h2>' +
      renderFieldsSection(results.formFields, config.includeRawJson) +
      '</section>';
    html +=
      '<section id="external-relations"><h2>他アプリ連携</h2>' +
      renderExternalAppRelationsSection(results.formFields) +
      '</section>';
    html +=
      '<section id="layout"><h2>レイアウト</h2>' +
      renderLayoutSection(results.formLayout, config.includeRawJson) +
      '</section>';
    html +=
      '<section id="views"><h2>一覧設定</h2>' +
      renderViewsSection(results.views, config.includeRawJson) +
      '</section>';
    html +=
      '<section id="process"><h2>プロセス管理</h2>' +
      renderProcessSection(results.processManagement, config.includeRawJson) +
      '</section>';

    if (config.includePermissions) {
      html +=
        '<section id="permissions"><h2>権限</h2>' +
        renderPermissionsSection(
          {
            app: results.appPermissions,
            record: results.recordPermissions,
            field: results.fieldPermissions
          },
          config.includeRawJson
        ) +
        '</section>';
    }

    if (config.includeNotifications) {
      html +=
        '<section id="notifications"><h2>通知</h2>' +
        renderNotificationsSection(
          {
            general: results.generalNotifications,
            perRecord: results.perRecordNotifications,
            reminder: results.reminderNotifications
          },
          config.includeRawJson
        ) +
        '</section>';
    }

    if (config.includeCustomization) {
      html +=
        '<section id="customization"><h2>カスタマイズ</h2>' +
        renderCustomizationSection(
          {
            customization: results.customization,
            plugins: results.plugins
          },
          config.includeRawJson
        ) +
        '</section>';
    }

    if (config.includeAdminNotes) {
      html +=
        '<section id="admin-notes"><h2>アプリ管理者メモ</h2>' +
        renderAdminNotesSection(results.adminNotes, config.includeRawJson) +
        '</section>';
    }

    html += '</div></body></html>';
    return html;
  };

  // 生成した HTML をブラウザダウンロードへ流す。
  const downloadHtml = (content, fileName) => {
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  };

  // ローディング表示は利用できる画面だけで呼び出し、未対応画面では無視する。
  const toggleLoading = (visible) => {
    if (typeof kintone.showLoading !== 'function') {
      return;
    }

    kintone.showLoading(visible ? 'VISIBLE' : 'HIDDEN');
  };

  // 設定画面から呼び出すメイン処理。
  // 設定 -> API 取得 -> HTML 生成 -> ダウンロードの順で進む。
  const exportDesignDocument = async (savedConfig) => {
    const appId = kintone.app.getId();
    if (!appId) {
      throw new Error('アプリIDを取得できませんでした。');
    }

    const config = normalizeConfig(savedConfig);
    toggleLoading(true);

    try {
      const results = await collectResults(appId, config);
      const html = buildHtmlDocument(results, config);
      const fileName =
        config.outputFilePrefix +
        '_app' +
        appId +
        '_' +
        timestampForFile() +
        '.html';
      downloadHtml(html, fileName);
      return {
        appId: appId,
        fileName: fileName
      };
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      toggleLoading(false);
    }
  };

  // 設定画面から再利用しやすいよう、共有APIとして window 配下へ公開する。
  window.KintoneDesignDocExporter = {
    defaultConfig: DEFAULT_CONFIG,
    normalizeConfig: normalizeConfig,
    exportDesignDocument: exportDesignDocument
  };
})(kintone.$PLUGIN_ID);
