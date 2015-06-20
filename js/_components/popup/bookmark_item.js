import {element} from 'deku';

const _getMsg = chrome.i18n.getMessage;

function clickHandler(event, {props, state}) {
  const itemInfo = props.itemInfo;
  const mouseButton = event.button;

  switch (globals.getBookmarkType(itemInfo)) {
    case 'folder':
      break;

    case 'bookmark':
      openBookmark(mouseButton, itemInfo.url);
  }
}

function contextMenuHandler(event, {props, state}, updateState) {
  // disable native context menu
  event.preventDefault();

  const itemInfo = props.itemInfo;

  globals.setRootState({
    menuTarget: itemInfo,
    mousePos: {x: event.x, y: event.y}
  });
}

function dragEndHandler(event, {props, state}) {

}

function dragOverHandler(event, {props, state}) {

}

function dragStartHandler(event, {props, state}) {

}

function initialState() {
  return {
    isSelected: false
  };
}

function mouseEnterHandler(event, {props, state}, updateState) {
  if (event.target !== event.delegateTarget) {
    return true;
  }

  const itemInfo = props.itemInfo;

  if (!state.isSelected) {
    updateState({isSelected: true});
  }

  if (globals.isFolder(itemInfo)) {
    openFolder(itemInfo);
  }
}

function mouseLeaveHandler(event, {props, state}, updateState) {
  if (event.target !== event.delegateTarget) {
    return true;
  }

  updateState({isSelected: false});
}

function openBookmark(mouseButton, itemUrl) {
  let switcher;

  if (mouseButton === 0) {
    switcher = 'Left';

    // if (ON_MOD_KEY === 16) {
    //   switcher += 'Shift';
    // } else if (ON_MOD_KEY === 17) {
    //   switcher += 'Ctrl';
    // }
  } else {
    switcher = 'Middle';
  }

  const handlerId = globals.storage['clickBy' + switcher];

  switch (handlerId) {
    case 0: // current tab
    case 1: // current tab (w/o closing PmB)
      if (itemUrl.indexOf('javascript') !== 0) {
        chrome.tabs.update({url: itemUrl});
      } else {
        if (globals.storage.bookmarklet) {
          chrome.tabs.executeScript(null, {code: itemUrl});
        } else if (confirm(_getMsg('alert_bookmarklet'))) {
          globals.openOptionsPage();
        }
      }
      break;

    case 2: // new tab
    case 3: // background tab
    case 4: // background tab (w/o closing PmB)
      chrome.tabs.create({
        url: itemUrl,
        active: handlerId === 2
      });
      break;

    case 5: // new window
    case 6: // incognito window
      chrome.windows.create({
        url: itemUrl,
        incognito: handlerId === 6
      });
  }

  if (handlerId !== 1 && handlerId !== 4) {
    setTimeout(window.close, 200);
  }
}

function openFolder(itemInfo) {
  return globals.getSingleTree(itemInfo.id)
    .then((treeInfo) => {

    });
}

function render({props, state}) {
  const itemClasses = [
    'item',
    'bookmark-item',
    'no-text-overflow'
  ];
  const itemInfo = props.itemInfo;

  const itemTitle = itemInfo.title || itemInfo.url;

  let iconSrc;
  let isDraggable = true;
  let tooltip;

  if (globals.isFolder(itemInfo)) {
    iconSrc = 'img/folder.png';

    if (globals.isRootFolder(itemInfo)) {
      itemClasses.push('root-folder');

      isDraggable = false;
    }
  } else {
    if (itemInfo.url === globals.separateThisUrl) {
      itemClasses.push('separator');
    } else {
      iconSrc = `chrome://favicon/${itemInfo.url}`;

      if (globals.storage.tooltip) {
        tooltip = itemInfo.title + '\n' + itemInfo.url;
      }
    }
  }

  if (state.isSelected) {
    itemClasses.push('selected');
  }

  return (
    <p
      class={itemClasses}
      title={tooltip}
      draggable={isDraggable}
      onClick={clickHandler}
      onContextMenu={contextMenuHandler}
      onDragEnd={dragEndHandler}
      onDragOver={dragOverHandler}
      onDragStart={dragStartHandler}
      onMouseEnter={mouseEnterHandler}
      onMouseLeave={mouseLeaveHandler}>
      <img class='icon' src={iconSrc} alt='' draggable='false' />
      <span>{itemTitle}</span>
    </p>
  );
}

export default {initialState, render};
