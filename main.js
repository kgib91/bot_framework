const idb = window.indexedDB;
const bot_db_size = 1 * 1024 * 1024; // 1mb
const bot_db_version = 1;
const bot_db_function_store_name = 'function_store';

const indexed_db_readonly_str = 'readonly';
const indexed_db_readwrite_str = 'readwrite';
const bot_ui_stylesheet = `
  #bot_ui_document_root { position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 2147483646; pointer-events: none; background: transparent; }
  #bot_ui_modal_root { position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 2147483647; pointer-events: none; background: transparent; }
  #botmodal { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.5); pointer-events: auto; }
  #botui { position: fixed; top: 0; left: 0; border: 1px solid red; padding: 2mm; border: 1px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); pointer-events: auto; }
  #botui * { padding: 0px; margin: 0; }
  #botui .pill>:first-child { border-top-left-radius: 3px; border-bottom-left-radius: 3px; border-right: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; }
  #botui .pill>:last-child { border-top-right-radius: 3px; border-bottom-right-radius: 3px; border-left: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; }
  #botui .pill .status { display: none; cursor: default; }
  #botui .pill button { user-select: none; cursor: pointer; border: 1px solid black; background-color: rgba(0, 0, 0, 0.8); color: white; padding-left: 2mm; padding-right: 2mm; height: 18px; line-height: 18px; vertical-align: middle; margin-bottom: 2mm; font-size: 12px; }
  #botui button.action { user-select: none; cursor: pointer; border: 1px solid black; width: 20px; height: 20px; background-color: rgba(0, 0, 0, 0.8); line-height: 20px; vertical-align: middle; color: white; }
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
  return {
    view: () => {
      return m('div', { id: 'botmodal' }, 'test');
    }
  };
}

function BotUIFunctionComponent(node) {
  let editor = null;
  let status = 'idle';
  
  this.is_editor_active = () => !!editor;
  
  this.save_edited_data = () => {
    console.log('do save');
  }
  
  this.open_editor = () => {
    editor = {
      view: () => {
        return m(BotPopupModalComponent, { onclose: this.save_edited_data.bind(this) }, [
              m(BotUIFunctionEditorComponent, {target: node.attrs.data})
        ]);
      }
    };
    console.log('open editor:', editor);
    m.mount(bot_ui_modal_root, editor);
  };
  
  return {
    oninit: () => {
      
    },
    view: () => {
      return m('div', { class: `pill ${status}` }, [
        m('button', { }, node.attrs.data.name),
        m('button', { onclick: this.open_editor.bind(this) }, m('i', { class: 'fa-solid fa-pencil fa-sm' }))
      ]);
    }
  }
}

function BotUIComponent() {
  this.load_async = async function() {
    console.log('begin loading functions');
    this.state.data = await read_db_store_all_async(bot_db, bot_db_function_store_name);
    m.redraw();
    console.log('end loading functions');
  }
      
  this.add_new_function = function() {
    console.log('invoked add_new_function');
    (async () => {
      await db_store_cmd_async(bot_db, bot_db_function_store_name, 'add', {
        name: 'New Function',
        type: function_type_sequence_str
      });
      await this.load_async();
    })();
  };
  
  return {
    oninit: async (ctrl) => {
      await this.load_async();
    },
    view: () => {
      let loadedFunctions = this.state.data || [];
      let existingFunctionsDom = loadedFunctions.map(x => m(BotUIFunctionComponent, { data: x }));
      
      return m('div', { id: 'botui' }, [
        m('div', [
          ...existingFunctionsDom,
          m('div', { style: 'float: right;' }, [
            m('button', { class: 'action', onclick: this.add_new_function.bind(this) }, m('i', { class: 'fa-solid fa-add' }))
          ])
        ])
      ])
    }
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

export async function initialize_async(bot_id) {
  validate_bot_id(bot_id);
  console.log('begin initializing bot: ', bot_id);
  console.info('opening local databases');
  await initialize_databases_async(bot_id);
  console.info('mounting bot framework ui');
  await import('https://unpkg.com/mithril/mithril.js');
  await import('https://kit.fontawesome.com/8768117172.js');
  await initialize_ui_async();
  console.log('end initializing bot');
}
