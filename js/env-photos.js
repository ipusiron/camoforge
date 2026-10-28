/**
 * EnvPhoto - 環境プリセットの「写真」側の一覧（ファイルの場所と出典）を持つ純粋なデータ。
 *
 * 生成した背景（EnvPreset）と同じ id で、実際の環境を写した写真を並べる。
 * 「生成では馴染むのに写真では浮く」のように、作った背景と本物の背景で結果がずれる
 * ことを比べるために使う。
 *
 * 写真は 1280×720（表示と同じ大きさ）、サムネイルは 320×180。どれも EXIF を持たない。
 * ambientCG の3枚は、色の画像に同梱の法線マップと AO から陰影を焼き込んである
 * （色の画像だけだと光の当たらない平板な面になるため）。
 */
(function (global) {
  'use strict';

  var CC0 = { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' };

  /**
   * 写真の一覧。並びは画面のボタンの順。
   * src = 表示用の写真、thumb = ボタンと採点に使うサムネイル、credit = 出典。
   */
  var PHOTOS = [
    {
      id: 'forest', src: 'assets/background.jpg', thumb: 'assets/env/thumb/forest.jpg',
      credit: { title: '森の小道', author: 'IPUSIRON', site: null, url: null, license: null, note: '作者撮影' }
    },
    {
      id: 'snow', src: 'assets/env/snow.jpg', thumb: 'assets/env/thumb/snow.jpg',
      credit: { title: 'Snow 005', author: 'ambientCG', site: 'ambientCG', url: 'https://ambientcg.com/a/Snow005', license: CC0, note: '法線マップと AO から陰影を焼き込み' }
    },
    {
      id: 'soil', src: 'assets/env/soil.jpg', thumb: 'assets/env/thumb/soil.jpg',
      credit: {
        title: 'Ground 048', author: 'ambientCG', site: 'ambientCG', url: 'https://ambientcg.com/a/Ground048',
        license: CC0, note: '法線マップと AO から陰影を焼き込み'
      }
    },
    {
      id: 'grass', src: 'assets/env/grass.jpg', thumb: 'assets/env/thumb/grass.jpg',
      credit: { title: 'Grass 004', author: 'ambientCG', site: 'ambientCG', url: 'https://ambientcg.com/a/Grass004', license: CC0, note: '法線マップと AO から陰影を焼き込み' }
    },
    {
      id: 'server', src: 'assets/env/server.jpg', thumb: 'assets/env/thumb/server.jpg',
      credit: {
        title: 'Front of server racks at NERSC', author: 'Derrick Coetzee', site: 'Wikimedia Commons',
        url: 'https://commons.wikimedia.org/wiki/File:Front_of_server_racks_at_NERSC.jpg', license: CC0, note: '16:9 に切り抜き'
      }
    },
    {
      id: 'cables', src: 'assets/env/cables.jpg', thumb: 'assets/env/thumb/cables.jpg',
      credit: {
        title: 'EthernetSwitch2', author: 'Raysonho @ Open Grid Scheduler / Grid Engine', site: 'Wikimedia Commons',
        url: 'https://commons.wikimedia.org/wiki/File:EthernetSwitch2.jpg', license: CC0, note: '16:9 に切り抜き'
      }
    }
  ];

  function find(id) {
    for (var i = 0; i < PHOTOS.length; i++) if (PHOTOS[i].id === id) return PHOTOS[i];
    return null;
  }

  /** 写真の一覧（id・src・thumb・credit）。呼び出し側が書き換えても元の一覧は変わらない。 */
  function list() {
    return PHOTOS.map(function (p) {
      return { id: p.id, src: p.src, thumb: p.thumb, credit: p.credit };
    });
  }

  global.EnvPhoto = { PHOTOS: PHOTOS, list: list, find: find };
  if (typeof module !== 'undefined' && module.exports) module.exports = { EnvPhoto: global.EnvPhoto };
})(typeof globalThis !== 'undefined' ? globalThis : this);
