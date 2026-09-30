(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PurePagination = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function sliceByCursor(records, cursor, limit) {
    var filtered = records
      .filter(function (record) {
        return Number(record.serverSeq) > Number(cursor);
      })
      .sort(function (left, right) {
        return Number(left.serverSeq) - Number(right.serverSeq);
      });

    var items = filtered.slice(0, limit);
    return {
      items: items,
      nextCursor: items.length ? Number(items[items.length - 1].serverSeq) : Number(cursor),
      hasMore: filtered.length > items.length
    };
  }

  function combineSlices(cursor, slices) {
    var overflowingLastSeqs = slices
      .filter(function (slice) { return slice.hasMore && slice.items.length; })
      .map(function (slice) { return Number(slice.items[slice.items.length - 1].serverSeq); });
    if (overflowingLastSeqs.length) {
      return Math.min.apply(null, overflowingLastSeqs);
    }

    var allItems = [];
    slices.forEach(function (slice) {
      allItems = allItems.concat(slice.items);
    });
    return allItems.length
      ? Math.max.apply(null, allItems.map(function (row) { return Number(row.serverSeq); }))
      : Number(cursor);
  }

  return {
    sliceByCursor: sliceByCursor,
    combineSlices: combineSlices
  };
});
