// Paginator - https://github.com/projectwizards/paginator
// An extension of vivliostyle-print (https://github.com/vivliostyle/vivliostyle-print)
// It enables vivliostyle pagination in an embedded WKWebView under iOS and macOS
// and it provides a description of every HTML element in a paginated layout.
// This code is released under the GNU Affero General Public License v3.0 (https://www.gnu.org/licenses/agpl-3.0.en.html)

import { CoreViewer } from './vivliostyle.es6.js'

export function setupPaginator() {
    
    // The viewport is a div element into which Vivliostyle puts the final paginated pages.
    var viewport = document.getElementById("pagination-viewport")
    var viewer = new CoreViewer( { viewportElement: viewport, window: window, debug: false },
    {
        pageViewMode: "singlePage",
    })
    
    function loadDocument(url, zoom) {
        console.log("load")
        viewer.loadDocument(url, {}, {
            pageViewMode: "singlePage",
            zoom: zoom,
            // Prevents auto re-running of layout when the window is resized.
            autoResize: false
        })
    }
    
    // Returns a description for every HTML element of the current page which has an id, name or href.
    // The description contains the in-page rectangles from which PDF annotations can be created.
    function elementsOfCurrentPage() {
        let pageBox = currentPageBox()
        if(pageBox == null) return []
        let parts = []
        let elements = pageBox.querySelectorAll("[id], [name], a[href]")
        for (let elementIndex = 0; elementIndex < elements.length; elementIndex++) {
            let element = elements[elementIndex]
            let id      = element.id
            // Vivliostyle implicitly creates an anchor element for every element with an id. Their ids are a mangeled
            // variant of the original id. We simply skip those anchors as we are interested in the original ids and
            // elements as annotations.
            if(id.startsWith("viv-id-"))
                continue
            let tag   = element.tagName.toLowerCase()
            let name  = element.getAttribute("name")
            let classNames = [...element.classList]
            let href  = demangledHref(element.getAttribute("href"))
            let rects = DOMRect.dictionariesForDOMRects(element.getRelativeClientRects(pageBox))
            if(rects.length > 0)
                parts.push({ tag: tag, classNames: classNames, id: id, name: name, href: href, rects: rects })
        }
        return parts
    }
    
    // Vivliostyle creates in-document hrefs of the form:
    // #viv-id-:002fpageableContentDD835404-D8AE-4FC3-A6BE-E1BFD35C6885:002ehtml:0023[actual href]
    // Special characters are encoded as UTF-16 code units in hex preceded by a colon.
    function demangledHref(href) {
        if(href == null || !href.startsWith("#"))
            return href
        let marker = "ehtml:0023"
        let index = href.indexOf(marker)
        if(index == -1) return href
        let rawHref = href.substring(index + marker.length)
        let unescapedHref = unescapeString(rawHref)
        return "#" + unescapedHref
    }
    
    function unescapeString(str) {
        const regexp = new RegExp(`:[0-9a-fA-F]{4}`, "g")
        return str.replace(regexp, unescapeChar)
    }
    
    function unescapeChar(str) {
        let prefix = ":"
        if(str.indexOf(prefix) === 0)
            return String.fromCharCode(parseInt(str.substring(prefix.length), 16))
        else
            return str
    }
  
    DOMRect.prototype.dictionaryRepresentation = function() {
        return { x: this.x, y: this.y, width: this.width, height: this.height }
    }

    DOMRect.dictionariesForDOMRects = function(rects) {
        let dicts = [];
        for (let index = 0; index < rects.length; index++)
            dicts.push(rects[index].dictionaryRepresentation())
        return dicts;
    }
    
    Element.prototype.getRelativeClientRects = function(parentElement) {
        let parentRect = parentElement.getBoundingClientRect()
        let rects = this.getClientRects()
        let relativeRects = []
        for (let index = 0; index < rects.length; index++) {
            let rect = rects[index]
            let relativeRect = new DOMRect(rect.x - parentRect.x, rect.y - parentRect.y, rect.width, rect.height)
            relativeRects.push(relativeRect)
        }
        return relativeRects
    }
    
     function didChangeReadyState(viewer) {
        window.webkit?.messageHandlers.notifications.postMessage({ "name": "readyStateDidChange",
                                                                   "object": viewer.readyState })
    }
    
    function didFinishNavigation(viewer) {
        fixMathJaxBaselines()
        window.webkit?.messageHandlers.notifications.postMessage({ "name": "didFinishNavigation" })
    }
    
    // As the CoreViewer does not allow querying the current page, we need to do our own bookkeeping.
    var currentPageIndex = 0
    
    function showPage(index) {
        currentPageIndex = index
        viewer.navigateToPage("epage", index)
    }
    
    function fixMathJaxBaselines() {
        if (typeof window.fixBaselinesOfAllMathJaxSVGs === "function") {
            window.fixBaselinesOfAllMathJaxSVGs()
        }
    }
    
    function currentPageContainer() {
        return spreadContainer()?.children[currentPageIndex]
    }
    
    function currentPageBox() {
        return currentPageContainer()?.querySelector("[data-vivliostyle-page-box]")
    }
    
    function spreadContainer() {
        return document.querySelector("[data-vivliostyle-spread-container]")
    }
        
    viewer.addListener("readystatechange", () => { didChangeReadyState(viewer) })
    viewer.addListener("nav",              () => { didFinishNavigation(viewer) })

    // The only way to expose functions of a JavaScript module to be called by WKWebView is to attach them to
    // the global window object. We do this for the functions we need to call from Swift.
    window.loadDocument = loadDocument
    window.elementsOfCurrentPage = elementsOfCurrentPage
    window.showPage = showPage
    window.getPageSizes = function() {
        return viewer.getPageSizes()
    }
    window.disableAutomaticMathjaxUpdates = true
}
