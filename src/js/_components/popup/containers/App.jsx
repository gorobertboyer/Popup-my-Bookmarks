import {autobind, debounce} from 'core-decorators'
import {connect} from 'react-redux'
import {createElement, Component, PropTypes} from 'react'
import _debounce from 'lodash.debounce'

import {
  genBookmarkList,
  getBookmarkType,
  getFlatTree,
  getSearchResult,
  getSlicedTrees,
  isFolder
} from '../functions'
import {
  removeTreeInfosFromIndex,
  replaceTreeInfoByIndex,
  updateEditorTarget,
  updateMenuTarget,
  updateKeyboardTarget,
  updateTrees
} from '../actions'
import {
  TYPE_ROOT_FOLDER
} from '../constants'
import Editor from '../components/Editor'
import Menu from '../components/Menu'
import MenuCover from '../components/MenuCover'
import Panel from '../components/Panel'

class App extends Component {
  constructor() {
    super()

    this.genBookmarkList = genBookmarkList.bind(this)
    this.getSearchResult = getSearchResult.bind(this)
  }

  componentDidMount() {
    this.initBookmarkEvent()
  }

  getKeyboardTargetTreeIndex() {
    const {
      keyboardTarget,
      trees
    } = this.props

    if (!keyboardTarget) {
      return trees.length - 1
    }

    if (getBookmarkType(keyboardTarget) === TYPE_ROOT_FOLDER) {
      return 0
    }

    return trees.findIndex((treeInfo) => treeInfo.id === keyboardTarget.parentId)
  }

  handleContextMenu(evt) {
    // allow native context menu if it is an input element
    if (evt.target.tagName === 'INPUT') {
      return
    }

    // disable native context menu
    evt.preventDefault()
  }

  @autobind
  handleKeyDown(evt) {
    evt.persist()

    this._handleKeyDown(evt)
  }

  @debounce(30)
  async _handleKeyDown(evt) {
    const keyCode = evt.keyCode

    switch (keyCode) {
      case 37: // left
        await this.keyboardArrowLeftRightHandler(true)
        break

      case 38: // up
        evt.preventDefault()
        await this.keyboardArrowUpDownHandler(true)
        break

      case 39: // right
        await this.keyboardArrowLeftRightHandler(false)
        break

      case 40: // down
        evt.preventDefault()
        await this.keyboardArrowUpDownHandler(false)
        break

      default:
    }
  }

  handleMouseDown(evt) {
    // disable the scrolling arrows after middle click
    if (evt.button === 1) {
      evt.preventDefault()
    }
  }

  initBookmarkEvent() {
    const renewCurrentTrees = () => renewTrees(this.props.trees)

    const renewSlicedTreesById = (itemId) => {
      const {trees} = this.props

      const removeFromIndex = trees.findIndex((treeInfo) => treeInfo.id === itemId)

      if (removeFromIndex >= 0) {
        const slicedTrees = getSlicedTrees(trees, removeFromIndex)

        renewTrees(slicedTrees)
      } else {
        renewCurrentTrees()
      }
    }

    const renewTrees = _debounce(async (oldTrees) => {
      const {
        dispatch,
        searchKeyword
      } = this.props

      const newTrees = await Promise.all(oldTrees.asMutable().map((treeInfo) => {
        if (treeInfo.id === 'search-result') {
          return this.getSearchResult(searchKeyword)
        }

        return getFlatTree(treeInfo.id)
      }))

      dispatch([
        // to make sure the menu is not activated when bookmark is updating
        updateEditorTarget(null),
        updateMenuTarget(null),

        updateTrees(newTrees)
      ])
    }, 100)

    chrome.bookmarks.onChanged.addListener(renewCurrentTrees)
    chrome.bookmarks.onCreated.addListener(renewCurrentTrees)
    chrome.bookmarks.onMoved.addListener(renewSlicedTreesById)
    chrome.bookmarks.onRemoved.addListener(renewSlicedTreesById)
  }

  async keyboardArrowLeftRightHandler(isLeft) {
    const {
      dispatch,
      editorTarget,
      keyboardTarget,
      menuTarget,
      trees
    } = this.props

    if (editorTarget || menuTarget) return
    if (!keyboardTarget) return

    const targetTreeIndex = this.getKeyboardTargetTreeIndex()

    if (isLeft) {
      if (trees.length > 0) {
        const prevTreeIndex = targetTreeIndex - 1
        const prevTreeInfo = trees[prevTreeIndex]

        const prevBookmarkList = this.genBookmarkList(prevTreeInfo, prevTreeIndex)

        dispatch([
          removeTreeInfosFromIndex(targetTreeIndex),
          updateKeyboardTarget(
            prevBookmarkList.find((itemInfo) => itemInfo.id === keyboardTarget.parentId)
          )
        ])
      }
    } else {
      if (isFolder(keyboardTarget)) {
        const nextTreeIndex = targetTreeIndex + 1
        const nextTreeInfo = await getFlatTree(keyboardTarget.id)

        const nextBookmarkList = this.genBookmarkList(nextTreeInfo, nextTreeIndex)

        dispatch([
          await replaceTreeInfoByIndex(nextTreeIndex, nextTreeInfo),
          updateKeyboardTarget(nextBookmarkList[0])
        ])
      }
    }
  }

  async keyboardArrowUpDownHandler(isUp) {
    const {
      dispatch,
      editorTarget,
      keyboardTarget,
      menuTarget,
      trees
    } = this.props

    if (editorTarget || menuTarget) return

    const targetTreeIndex = this.getKeyboardTargetTreeIndex()

    const targetBookmarkList = this.genBookmarkList(trees[targetTreeIndex], targetTreeIndex)

    const lastItemIndex = targetBookmarkList.length - 1

    let nextSelectedIndex
    if (keyboardTarget) {
      const origSelectedIndex = targetBookmarkList
        .findIndex((itemInfo) => itemInfo.id === keyboardTarget.id)

      if (isUp) {
        nextSelectedIndex = origSelectedIndex - 1
        if (nextSelectedIndex < 0) {
          nextSelectedIndex = lastItemIndex
        }
      } else {
        nextSelectedIndex = origSelectedIndex + 1
        if (nextSelectedIndex > lastItemIndex) {
          nextSelectedIndex = 0
        }
      }
    } else {
      nextSelectedIndex = isUp ? lastItemIndex : 0
    }

    dispatch(updateKeyboardTarget(targetBookmarkList[nextSelectedIndex]))
  }

  render() {
    console.log('render')

    return (
      <div
        id='app'
        onContextMenu={this.handleContextMenu}
        onKeyDown={this.handleKeyDown}
        onMouseDown={this.handleMouseDown}
      >
        <Panel />
        <MenuCover />
        <Menu />
        <Editor />
      </div>
    )
  }
}

if (process.env.NODE_ENV !== 'production') {
  App.propTypes = {
    dispatch: PropTypes.func.isRequired,
    editorTarget: PropTypes.object,
    keyboardTarget: PropTypes.object,
    menuTarget: PropTypes.object,
    options: PropTypes.object.isRequired,
    rootTree: PropTypes.object.isRequired,
    searchKeyword: PropTypes.string.isRequired,
    trees: PropTypes.arrayOf(PropTypes.object).isRequired
  }
}

const mapStateToProps = (state) => ({
  editorTarget: state.editorTarget,
  keyboardTarget: state.keyboardTarget,
  menuTarget: state.menuTarget,
  options: state.options,
  rootTree: state.rootTree,
  searchKeyword: state.searchKeyword,
  trees: state.trees
})

export default connect(mapStateToProps)(App)
