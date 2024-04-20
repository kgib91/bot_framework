const BOT_VERSION = '0.0.21';

const idb = window.indexedDB;
const bot_db_size = 1 * 1024 * 1024; // 1mb
const bot_db_version = 1;
const bot_db_function_store_name = 'function_store';

const indexed_db_readonly_str = 'readonly';
const indexed_db_readwrite_str = 'readwrite';
const bot_ui_stylesheet = `
  #bot_ui_document_root { position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 2147483646; pointer-events: none; background: transparent; }
  #bot_ui_modal_root { position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 2147483647; pointer-events: none; background: transparent; }
  .botmodal { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.5); pointer-events: auto; }
  #botui__ { position: fixed; top: 0; left: 0; border: 1px solid red; padding: 2mm; border: 1px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); pointer-events: auto; }
  #botui__ * { padding: 0px; margin: 0; }
  #botui__ .pill>:first-child { border-top-left-radius: 3px; border-bottom-left-radius: 3px; border-right: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; }
  #botui__ .pill>:last-child { border-top-right-radius: 3px; border-bottom-right-radius: 3px; border-left: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; }
  #botui__ .pill .status { display: none; cursor: default; }
  #botui__ .pill button { user-select: none; cursor: pointer; border: 1px solid black; background-color: rgba(0, 0, 0, 0.8); color: white; padding-left: 2mm; padding-right: 2mm; height: 18px; line-height: 18px; vertical-align: middle; margin-bottom: 2mm; font-size: 12px; }
  #botui__ button.action { user-select: none; cursor: pointer; border: 1px solid black; width: 20px; height: 20px; background-color: rgba(0, 0, 0, 0.8); line-height: 20px; vertical-align: middle; color: white; }
`;

var bot_db = null;
var bot_ui_document_root = null;
var bot_ui_modal_root = null;

function db_transaction_async(db, store, mode, handler) {
  return new Promise((success, error) => {
    let tx = db.transaction([store], mode);
    handler(tx);
    tx.oncomplete = (e) => success(e.target.result);
    tx.onerror = error;
  });
}

function read_db_store_all_async(db, store, filter) {
  if(!filter) {
    return new Promise((success, error) => {
      (async () => {
        await db_transaction_async(db, store, indexed_db_readonly_str, (tx) => {
          let request = tx.objectStore(store).getAll();
          request.onsuccess = (e) => success(e.target.result);
          request.onerror = error;
        });
      })();
    });
  }
}

function db_store_cmd_async(db, store, mode, data) {
  return new Promise((success, error) => {
    (async () => {
        await db_transaction_async(db, store, indexed_db_readwrite_str, (tx) => {
        let request = tx.objectStore(store)[mode](data);
        request.onsuccess = (e) => success(e.target.result);
        request.onerror = error;
      });
    })();
  });
}

function validate_indexed_db() {
  if (!idb) {
    throw 'browser does not support indexed db';
  }
}

function open_db_async(name, version, upgrade_handler) {
  return new Promise((success, error) => {
    let request = idb.open(name, version);
    request.onsuccess = (e) => { success(e.target.result); };
    request.onupgradeneeded = (e) => upgrade_handler(e.target.result);
    request.onerror = error;
  });
}

function bot_db_upgrade_handler(db) {
  console.log("migrating bot database");
  if(!db.objectStoreNames.contains(bot_db_function_store_name)) {
    let store = db.createObjectStore(bot_db_function_store_name, { keyPath: 'id', autoIncrement: true });    
    store.createIndex('name_idx', 'name', { unique: true });
    store.createIndex('type_idx', 'type', { unique: false });
  }
}

async function initialize_databases_async(bot_id) {
  validate_indexed_db();
  const bot_db_name = `${bot_id}_database`;
  bot_db = await open_db_async(bot_db_name, bot_db_version, bot_db_upgrade_handler);
}

function validate_bot_id(id) {
  if(!/^[aA-zZ0-9_]+$/.test(id)) {
    throw 'bot id must match /^[aA-zZ0-9_]+$/';
  }
}

const function_type_sequence_str = 'sequence';
const function_type_toggle_str = 'toggle';

function BotUIFunctionEditorComponent(node) {
  return {
    view: () => {
      return m('div', 'test');
    }
  };
}

function BotPopupModalComponent(node) {
  let editor = null;

  function oncreate(vnode) {
    editor = ace.edit("editor");
    editor.setTheme("ace/theme/monokai");
    editor.session.setMode("ace/mode/javascript");
    editor.setOptions({
      enableBasicAutocompletion: true,
      enableSnippets: true,
      enableLiveAutocompletion: false
    });
    editor.setValue(vnode.attrs.data.code || '');
  }

  function save() {
    node.attrs.onsave(editor.getValue());
    m.mount(bot_ui_modal_root, null);
  }

  function close() {
    m.mount(bot_ui_modal_root, null);
  }

  return {
    oncreate,
    view: () => {
      return m('div', { class: 'botmodal' }, [
        m('div', { class: 'editorContainer' }, [
          m('div', { class: 'editorHeader' }, ` ${node.attrs.data.name}`),
          m('div', { id: 'editor', style: { height: '200px' }, class: 'editor' }),
          m('button', { onclick: save, class: 'primary' }, 'Save'),
          m('button', { onclick: close, class: 'secondary' }, 'Close')
        ])
      ]);
    }
  };
}

function BotUIFunctionComponent(node) {
  let status = 'idle';

  this.save_edited_data = (newCode) => {
    console.log('do save', newCode);
    // Implement saving logic here, possibly updating IndexedDB
    db_store_cmd_async(bot_db, bot_db_function_store_name, 'put', { ...node.attrs.data, code: newCode }).then(() => {
      console.log('Saved successfully');
    });
  };

  this.open_editor = () => {
    // Re-fetch the latest function data
    read_db_store_all_async(bot_db, bot_db_function_store_name).then(functions => {
      const currentFunction = functions.find(f => f.id === node.attrs.data.id);
      const editorComponent = {
        view: () => m(BotPopupModalComponent, { data: currentFunction || node.attrs.data, onsave: this.save_edited_data })
      };
      m.mount(bot_ui_modal_root, editorComponent);
    });
  };

  return {
    view: () => {
      return m('button', { class: `pill ${status}`, onclick: this.open_editor.bind(this) }, [
        m('i', { class: 'fa-solid fa-code fa-sm' }),
        m('span', {}, node.attrs.data.name)
      ]);
    }
  };
}

// Add context menu for creating new functions
function BotUIAddMenuComponent() {
  return {
    view: () => m('div', { class: 'context-menu' }, [
      m('button', { onclick: () => botUIComponent.add_new_function('Function') }, 'Function'),
      m('button', { onclick: () => botUIComponent.add_new_function('Pom'), disabled: true }, 'POM'),
      m('button', { onclick: () => botUIComponent.add_new_function('Flow'), disabled: true }, 'Flow')
    ])
  };
}

function BotUIComponent() {
  this.state = { data: [] };

  this.load_async = async function() {
    this.state.data = await read_db_store_all_async(bot_db, bot_db_function_store_name);
    m.redraw();
    console.log('Loaded functions');
  };

  this.add_new_function = async function(type) {
    const newItem = { name: `New ${type}`, type: function_type_sequence_str };
    const addedItem = await db_store_cmd_async(bot_db, bot_db_function_store_name, 'add', newItem);
    console.log(`Added new ${type}: ID ${addedItem}`);
    await this.load_async();
  };

  return {
    oninit: () => this.load_async(),
    view: () => m('div', { id: 'botui__' }, [
      this.state.data.map(x => m(BotUIFunctionComponent, { data: x })),
      m('div', { style: 'float: right;' }, [
        m('span', `V${BOT_VERSION}`),
        m('button', { class: 'action', onclick: () => m.mount(document.body, BotUIAddMenuComponent) }, m('i', { class: 'fa-solid fa-add' }))
      ])
    ])
  };
}

async function initialize_ui_async() {
  let style = document.createElement('style');
  style.innerHTML = bot_ui_stylesheet;
  document.head.appendChild(style);
  
  bot_ui_document_root = document.createElement('div');
  bot_ui_document_root.id = 'bot_ui_document_root';
  bot_ui_modal_root = document.createElement('div');
  bot_ui_modal_root.id = 'bot_ui_modal_root';
  
  document.body.append(bot_ui_document_root);
  document.body.append(bot_ui_modal_root);
  
  m.mount(bot_ui_document_root, BotUIComponent);
}

function load_script_async(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.type = 'module';
        script.onload = () => resolve(script);
        script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
        document.body.appendChild(script);
    });
}

async function import_ace_async() {
  let ace = await System.import('https://cdnjs.cloudflare.com/ajax/libs/ace/1.4.14/ace.js');
  try {
    ace.config.set('basePath', 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.4.14/');
    ace.require('ace/ext/language_tools');
    console.log('Ace Editor loaded and configured');
  } catch(err) {
    console.error('Failed to load Ace Editor:', err);
  }
}

export async function initialize_async(bot_id) {
    validate_bot_id(bot_id);
    console.log('begin initializing bot: ', bot_id, BOT_VERSION);
    console.info('opening local databases');
    await initialize_databases_async(bot_id);
    console.info('mounting bot framework ui');

    // Load and configure SystemJS
    await load_script_async('https://cdn.jsdelivr.net/npm/systemjs/dist/system.min.js');

    // Load other dependencies
    await import('https://unpkg.com/mithril/mithril.js');
    await import('https://kit.fontawesome.com/8768117172.js');
    
    // Import ACE using SystemJS
    await import_ace_async();

    await initialize_ui_async();
    console.log('end initializing bot');
}

