/**
 * i18n.js – Localization for Mini Local File Manager
 * Supports: ja (Japanese), en (English)
 */
'use strict';

const I18N = {
  ja: {
    tabFolder:'フォルダ階層', tabEditor:'マークダウン編集',
    open:'開く', newFile:'新規ファイル', newFolder:'新規フォルダ', search:'検索',
    noFolder:'フォルダが開かれていません',
    noFolderTitle:'フォルダが開かれていません',
    noFolderHint:'「開く」または Ctrl+O でフォルダを選択',
    openFolder:'フォルダを開く',
    edit:'編集', save:'保存', backToFolder:'フォルダへ戻る',
    noFile:'ファイルが選択されていません',
    noFileTitle:'ファイルが選択されていません',
    noFileHint:'フォルダ階層からファイルを選択',
    readonly:'読取専用',
    ctxOpen:'開く', ctxEdit:'テキスト編集', ctxSetRoot:'ここをルートに設定',
    ctxNewFile:'新規ファイル', ctxNewFolder:'新規フォルダ',
    ctxCut:'切り取り', ctxCopy:'コピー', ctxPaste:'貼り付け',
    ctxRename:'名前変更', ctxDelete:'削除',
    openFolder2:'フォルダを開く', pathLabel:'パスを入力',
    recentFolders:'最近開いたフォルダ', noRecent:'まだ履歴がありません',
    confirmDelete:'削除の確認', doDelete:'削除する', cancel:'キャンセル',
    rename:'名前の変更', change:'変更',
    create:'作成', newFile2:'新規ファイル',
    searchTitle:'ファイル検索', searchName:'ファイル名キーワード',
    searchContentOpt:'テキスト内容も検索 (GREP)', doSearch:'検索', clear:'クリア',
    login:'ログイン', logout:'ログアウト',
    // Messages
    msgLoading:'読み込み中…', msgOpened:'開きました',
    msgSaved:'保存しました ✓', msgSavedLocal:'ローカルに保存しました',
    msgDeleted:'削除しました', msgRenamed:'名前変更しました',
    msgCopied:'コピーしました', msgMoved:'移動しました',
    msgCreated:'作成しました', msgAdded:'件追加しました',
    msgPasteEmpty:'クリップボードが空です',
    msgBinary:'バイナリファイルは編集できません',
    msgPermission:'権限がありません（読取専用ファイル）',
    msgError:'エラー', msgConnErr:'接続エラー',
    msgPathInvalid:'有効なパスではありません',
    msgPathNotDir:'パスはフォルダではありません',
    msgSearching:'検索中…', msgSearchDone:'件見つかりました',
    msgSearchNone:'見つかりませんでした',
    msgLoginFail:'ユーザー名またはパスワードが違います',
    msgRootSet:'ルートフォルダに設定しました',
    msgNoRoot:'先にフォルダを開いてください',
  },
  en: {
    tabFolder:'Folder Tree', tabEditor:'Markdown Editor',
    open:'Open', newFile:'New File', newFolder:'New Folder', search:'Search',
    noFolder:'No folder opened',
    noFolderTitle:'No folder opened',
    noFolderHint:'Click "Open" or press Ctrl+O to select a folder',
    openFolder:'Open Folder',
    edit:'Edit', save:'Save', backToFolder:'Back to Folder',
    noFile:'No file selected',
    noFileTitle:'No file selected',
    noFileHint:'Select a file from the folder tree',
    readonly:'Read-only',
    ctxOpen:'Open', ctxEdit:'Edit Text', ctxSetRoot:'Set as Root',
    ctxNewFile:'New File', ctxNewFolder:'New Folder',
    ctxCut:'Cut', ctxCopy:'Copy', ctxPaste:'Paste',
    ctxRename:'Rename', ctxDelete:'Delete',
    openFolder2:'Open Folder', pathLabel:'Enter path',
    recentFolders:'Recent Folders', noRecent:'No recent folders',
    confirmDelete:'Confirm Delete', doDelete:'Delete', cancel:'Cancel',
    rename:'Rename', change:'Rename',
    create:'Create', newFile2:'New File',
    searchTitle:'File Search', searchName:'Filename keyword',
    searchContentOpt:'Search file content (GREP)', doSearch:'Search', clear:'Clear',
    login:'Login', logout:'Logout',
    msgLoading:'Loading…', msgOpened:'Opened',
    msgSaved:'Saved ✓', msgSavedLocal:'Saved locally (server write failed)',
    msgDeleted:'Deleted', msgRenamed:'Renamed',
    msgCopied:'Copied', msgMoved:'Moved',
    msgCreated:'Created', msgAdded:'file(s) added',
    msgPasteEmpty:'Clipboard is empty',
    msgBinary:'Binary files cannot be edited',
    msgPermission:'Permission denied (read-only file)',
    msgError:'Error', msgConnErr:'Connection error',
    msgPathInvalid:'Invalid path',
    msgPathNotDir:'Path is not a directory',
    msgSearching:'Searching…', msgSearchDone:'result(s) found',
    msgSearchNone:'No results found',
    msgLoginFail:'Invalid username or password',
    msgRootSet:'Set as root folder',
    msgNoRoot:'Please open a folder first',
  }
};

let currentLang = localStorage.getItem('fm_lang') || 'ja';

function t(key) {
  return (I18N[currentLang] || I18N.ja)[key] || key;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.documentElement.lang = currentLang;
}

function toggleLang() {
  currentLang = currentLang === 'ja' ? 'en' : 'ja';
  localStorage.setItem('fm_lang', currentLang);
  applyI18n();
  // Update dynamic text
  if (window.onLangChange) window.onLangChange();
}
