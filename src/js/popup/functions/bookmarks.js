import {
  lastUsedTreeIdsStorage
} from './lastPosition'
import {
  ROOT_ID,
  SEPARATE_THIS_URL,
  TYPE_BOOKMARK,
  TYPE_FOLDER,
  TYPE_NO_BOOKMARK,
  TYPE_ROOT_FOLDER,
  TYPE_SEPARATOR
} from '../constants'
import chromep from '../../common/lib/chromePromise'

const msgNoBookmark = chrome.i18n.getMessage('noBkmark')
const noBookmarkIdPrefix = 'no-bookmark-'

export function genBookmarkList(treeInfo, {isSearching, rootTree, treeIndex}) {
  let childrenInfo = treeInfo.children

  if (!isSearching) {
    if (childrenInfo.length === 0) {
      childrenInfo = childrenInfo.concat([
        genNoBookmarkInfo(treeInfo.id)
      ])
    }

    if (treeIndex === 0) {
      return rootTree.children.concat(childrenInfo)
    }
  }

  return childrenInfo
}

export function genDummyItemInfo() {
  return {
    dateAdded: null,
    dateGroupModified: null,
    id: null,
    index: null,
    parentId: null,
    title: null
  }
}

function genNoBookmarkInfo(parentId) {
  return {
    ...genDummyItemInfo(),
    id: `${noBookmarkIdPrefix}${parentId}`,
    index: -1, // as it is not appeared in the childrenInfo
    parentId: parentId,
    title: msgNoBookmark
  }
}

export async function getBookmark(id) {
  const [itemInfo] = await chromep.bookmarks.get(id)
  return itemInfo
}

export function getBookmarkType(itemInfo) {
  if (RegExp(`^${noBookmarkIdPrefix}`).test(itemInfo.id)) {
    return TYPE_NO_BOOKMARK
  }

  if (itemInfo.parentId === ROOT_ID) {
    return TYPE_ROOT_FOLDER
  }

  if (!itemInfo.url) {
    return TYPE_FOLDER
  }

  if (itemInfo.url.startsWith(SEPARATE_THIS_URL)) {
    return TYPE_SEPARATOR
  }

  return TYPE_BOOKMARK
}

export async function getFlatTree(id) {
  const treeInfo = await getBookmark(id)

  treeInfo.children = await chromep.bookmarks.getChildren(id)

  return treeInfo
}

export async function getRootTree(options) {
  const rootTree = await getFlatTree(ROOT_ID)

  rootTree.children = rootTree.children.filter((itemInfo) => {
    const itemIdNum = Number(itemInfo.id)

    const isFilterThisItem = (
      itemIdNum === options.defExpand ||
      options.hideRootFolder.includes(itemIdNum)
    )

    return !isFilterThisItem
  })

  return rootTree
}

export async function getSearchResult(newSearchKeyword, options) {
  const filteredResult = []
  const isOnlySearchTitle = options.searchTarget === 1
  const results = await chromep.bookmarks.search(newSearchKeyword)
  const splittedKeyArr = []

  if (isOnlySearchTitle) {
    splittedKeyArr.push(
      ...newSearchKeyword.split(' ').map((x) => x.toLowerCase())
    )
  }

  for (const itemInfo of results) {
    if (getBookmarkType(itemInfo) === TYPE_BOOKMARK) {
      if (isOnlySearchTitle) {
        const itemTitle = itemInfo.title.toLowerCase()

        const isTitleMatched = splittedKeyArr.every((x) => itemTitle.includes(x))

        if (!isTitleMatched) {
          continue
        }
      }

      filteredResult.push(itemInfo)

      if (filteredResult.length === options.maxResults) {
        break
      }
    }
  }

  return {
    ...genDummyItemInfo(),
    children: sortByTitle(filteredResult),
    id: 'search-result'
  }
}

export function getSlicedTrees(trees, removeFromIndex) {
  if (trees.length > removeFromIndex) {
    return trees.slice(0, removeFromIndex)
  }

  return trees
}

export async function initTrees(options) {
  const defaultExpandFolderId = String(options.defExpand)

  const firstTree = await getFlatTree(defaultExpandFolderId)

  if (options.rememberPos) {
    const lastUsedTreeIds = lastUsedTreeIdsStorage.get()

    // the target is to open the last existing folder in lastUsedTreeIds
    // so we get the last existing item first and get all its parent
    // it can prevent bugs when user rearrange bookmarks location without updating lastUsedTreeIds
    let lastExistingTree
    for (let i = lastUsedTreeIds.length - 1; i >= 0; i -= 1) {
      // we already have firstTree
      if (lastUsedTreeIds[i] === defaultExpandFolderId) break

      try {
        lastExistingTree = await getFlatTree(lastUsedTreeIds[i])
      } catch (err) {
        // if it does not exist, we don't care
        console.error(err.stack)
      }

      if (lastExistingTree) break
    }

    if (lastExistingTree) {
      const trees = []

      let parentId = lastExistingTree.parentId
      while (
        parentId &&
        parentId !== ROOT_ID &&
        parentId !== defaultExpandFolderId
      ) {
        const tree = await getFlatTree(parentId)
        trees.unshift(tree)

        parentId = tree.parentId
      }

      trees.unshift(firstTree)
      trees.push(lastExistingTree)

      return trees
    }
  }

  return [firstTree]
}

export function isFolder(itemInfo) {
  const bookmarkType = getBookmarkType(itemInfo)

  return bookmarkType.includes(TYPE_FOLDER)
}

export function isFolderOpened(trees, itemInfo) {
  return trees.some((treeInfo) => treeInfo.id === itemInfo.id)
}

export async function openBookmark(itemInfo, clickType, options) {
  const itemUrl = itemInfo.url
  const openMethod = options[clickType]

  if (itemUrl.startsWith('javascript:')) {
    await chromep.tabs.executeScript(null, {code: itemUrl})
  } else {
    switch (openMethod) {
      case 0: // current tab
      case 1: // current tab (w/o closing PmB)
        await chromep.tabs.update({url: itemUrl})
        break

      case 2: // new tab
      case 3: // background tab
      case 4: // background tab (w/o closing PmB)
        await chromep.tabs.create({
          url: itemUrl,
          active: openMethod === 2
        })
        break

      case 5: // new window
      case 6: // incognito window
        await chromep.windows.create({
          url: itemUrl,
          incognito: openMethod === 6
        })
        break

      default:
    }
  }

  switch (openMethod) {
    case 1: // current tab (w/o closing PmB)
    case 4: // background tab (w/o closing PmB)
      break

    default:
      window.close()
  }
}

export async function openMultipleBookmarks(itemInfo, {
  isNewWindow = false,
  isIncognito = false,
  isWarnWhenOpenMany = false
}) {
  const urlList = []

  if (isFolder(itemInfo)) {
    const [treeInfo] = await chromep.bookmarks.getSubTree(itemInfo.id)

    const childrenInfo = treeInfo.children

    for (const thisItemInfo of childrenInfo) {
      if (getBookmarkType(thisItemInfo) === TYPE_BOOKMARK) {
        urlList.push(thisItemInfo.url)
      }
    }

    if (isWarnWhenOpenMany) {
      const msgAskOpenAll = chrome.i18n.getMessage('askOpenAll')
        .replace('%bkmarkCount%', urlList.length)

      if (urlList.length > 5 && !window.confirm(msgAskOpenAll)) {
        return
      }
    }
  } else {
    const thisItemInfo = await getBookmark(itemInfo.id)

    urlList.push(thisItemInfo.url)
  }

  if (!isNewWindow) {
    await Promise.all(urlList.map((url) => {
      return chromep.tabs.create({
        url,
        active: false
      })
    }))
  } else {
    await chromep.windows.create({
      url: urlList,
      incognito: isIncognito
    })
  }

  window.close()
}

export async function removeBookmark(target) {
  if (isFolder(target)) {
    await chromep.bookmarks.removeTree(target.id)
  } else {
    await chromep.bookmarks.remove(target.id)
  }
}

export function sortByTitle(bookmarkList) {
  const {compare} = new Intl.Collator()

  return bookmarkList.sort((a, b) => compare(a.title, b.title))
}
