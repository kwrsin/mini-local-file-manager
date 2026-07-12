/**
 * i18n.js – Localization for Mini Local File Manager
 * Auto-detects locale from browser/OS. English is the default.
 * Supports: en (English), ja (Japanese)
 */
'use strict';

var I18N = {
  ja: {
    tabFolder:'フォルダ階層', tabEditor:'マークダウン編集',
    open:'開く', newFile:'新規Markdown', newFolder:'新規フォルダ', search:'検索',
    noFolder:'フォルダが開かれていません',
    noFolderTitle:'フォルダが開かれていません',
    noFolderHint:'「開く」または Ctrl+O でフォルダを選択',
    openFolder:'フォルダを開く',
    edit:'編集', save:'保存', backToFolder:'フォルダへ戻る', reload:'再読み込み', msgReloaded:'再読み込みしました', reloadConfirm:'未保存の変更を破棄して再読み込みしますか？',
    replace:'置換', replaceTitle:'置換', replaceSearch:'検索', replaceWith:'置換文字',
    replaceRegex:'正規表現', replaceCaseSensitive:'大文字小文字を区別',
    replaceExec:'置換実行', msgReplaced:'件置換しました', msgReplaceNone:'一致なし',
    msgReplaceErr:'正規表現エラー:', cancel:'キャンセル',
    noFile:'ファイルが選択されていません',
    noFileTitle:'ファイルが選択されていません',
    noFileHint:'フォルダ階層からファイルを選択',
    readonly:'読取専用',
    ctxOpen:'開く', ctxEdit:'テキスト編集', ctxSetRoot:'ここをルートに設定',
    ctxNewFile:'新規Markdown', ctxNewFolder:'新規フォルダ', ctxUpload:'アップロード',
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
    msgLoading:'読み込み中…', msgOpened:'開きました',
    msgSaved:'保存しました ✓', msgSavedLocal:'ローカルに保存しました',
    msgDeleted:'削除しました', msgRenamed:'名前変更しました',
    msgCopied:'コピーしました', msgMoved:'移動しました',
    msgCreated:'作成しました', msgAdded:'件追加しました',
    msgPasteEmpty:'クリップボードが空です',
    msgBinary:'このファイルは編集できません',
    msgPermission:'権限がありません（読取専用ファイル）',
    msgError:'エラー', msgConnErr:'接続エラー',
    msgPathInvalid:'有効なパスではありません',
    msgPathNotDir:'パスはフォルダではありません',
    msgSearching:'検索中…', msgSearchDone:'件見つかりました',
    msgSearchNone:'見つかりませんでした',
    msgLoginFail:'ユーザー名またはパスワードが違います',
    msgRootSet:'ルートフォルダに設定しました',
    msgNoRoot:'先にフォルダを開いてください',
    msgDirMatch:'(フォルダ)',
    ctxZip:'ZIPに圧縮', ctxUnzip:'ZIPを解凍',
    ctxDownload:'ダウンロード',
    msgDownloading:'ダウンロード中…',
    ctxZipDone:'圧縮しました', ctxUnzipDone:'解凍しました',
    selectFiles:'ファイルを選択',
    uploadSizeLimit:'最大ファイルサイズ',
    uploadTooLarge:'サイズ超過',
    upload:'アップロード', uploadTitle:'ファイルをアップロード',
    uploadBtn:'アップロード',
    uploadDest:'アップロード先',
    msgUploaded:'アップロードしました',
    msgZipping:'圧縮中…', msgUnzipping:'解凍中…',
    mediaPlay:'メディアプレイヤー',
    dragMove:'ここに移動',
    moveSuccess:'移動しました',
    installApp:'アプリをインストール',
    updateAvailable:'更新があります — 再読み込みで適用'
  },
  en: {
    tabFolder:'Folder Tree', tabEditor:'Markdown Editor',
    open:'Open', newFile:'New Markdown', newFolder:'New Folder', search:'Search',
    noFolder:'No folder opened',
    noFolderTitle:'No folder opened',
    noFolderHint:'Click "Open" or press Ctrl+O to select a folder',
    openFolder:'Open Folder',
    edit:'Edit', save:'Save', backToFolder:'Back to Folder', reload:'Reload', msgReloaded:'Reloaded', reloadConfirm:'Discard unsaved changes and reload?',
    replace:'Replace', replaceTitle:'Find & Replace', replaceSearch:'Find', replaceWith:'Replace with',
    replaceRegex:'Regular expression', replaceCaseSensitive:'Case sensitive',
    replaceExec:'Replace All', msgReplaced:' replaced', msgReplaceNone:'No matches found',
    msgReplaceErr:'Regex error:', cancel:'Cancel',
    noFile:'No file selected',
    noFileTitle:'No file selected',
    noFileHint:'Select a file from the folder tree',
    readonly:'Read-only',
    ctxOpen:'Open', ctxEdit:'Edit Text', ctxSetRoot:'Set as Root',
    ctxNewFile:'New Markdown', ctxNewFolder:'New Folder', ctxUpload:'Upload',
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
    msgBinary:'This file cannot be edited',
    msgPermission:'Permission denied (read-only file)',
    msgError:'Error', msgConnErr:'Connection error',
    msgPathInvalid:'Invalid path',
    msgPathNotDir:'Path is not a directory',
    msgSearching:'Searching…', msgSearchDone:'result(s) found',
    msgSearchNone:'No results found',
    msgLoginFail:'Invalid username or password',
    msgRootSet:'Set as root folder',
    msgNoRoot:'Please open a folder first',
    msgDirMatch:'(folder)',
    ctxZip:'Compress to ZIP', ctxUnzip:'Extract ZIP',
    ctxDownload:'Download',
    msgDownloading:'Downloading…',
    ctxZipDone:'Compressed', ctxUnzipDone:'Extracted',
    selectFiles:'Select Files',
    uploadSizeLimit:'Max file size',
    uploadTooLarge:'Too large',
    upload:'Upload', uploadTitle:'Upload Files',
    uploadBtn:'Upload',
    uploadDest:'Upload to',
    msgUploaded:'Uploaded',
    msgZipping:'Compressing…', msgUnzipping:'Extracting…',
    mediaPlay:'Media Player',
    dragMove:'Move here',
    moveSuccess:'Moved',
    installApp:'Install App',
    updateAvailable:'Update available — reload to apply'
  }
};

/**
 * Detect locale from browser/OS. English is the default.
 * Only switches to Japanese when the primary language is explicitly 'ja'.
 */
function detectLang() {
  var langs = [];
  if (navigator.languages && navigator.languages.length) {
    langs = Array.prototype.slice.call(navigator.languages);
  } else if (navigator.language) {
    langs = [navigator.language];
  } else if (navigator.userLanguage) {
    langs = [navigator.userLanguage]; // IE fallback
  }
  for (var i = 0; i < langs.length; i++) {
    var l = langs[i].toLowerCase();
    if (l === 'ja' || l.indexOf('ja-') === 0) return 'ja';
  }
  return 'en'; // English default
}

// No localStorage persistence — always auto-detect from environment
var currentLang = detectLang();

function t(key) {
  var dict = I18N[currentLang] || I18N['en'];
  return dict[key] !== undefined ? dict[key] : (I18N['en'][key] || key);
}

function applyI18n() {
  var els = document.querySelectorAll('[data-i18n]');
  for (var i = 0; i < els.length; i++) {
    els[i].textContent = t(els[i].dataset.i18n);
  }
  var titleEls = document.querySelectorAll('[data-i18n-title]');
  for (var j = 0; j < titleEls.length; j++) {
    titleEls[j].title = t(titleEls[j].dataset.i18nTitle);
  }
  document.documentElement.lang = currentLang;
}
