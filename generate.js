var argv    = require('minimist')(process.argv.slice(2), { boolean: ["g", "s", "n"] }),
    Builder = require( 'node-spritesheet' ).Builder,
    https = require('https'),
    http = require('http'),
    path = require('path'),
    queue = require('queue'),
    swig    = require('swig'),
    imageType = require('image-type'),
    fs = require('fs'),
    status = 0;

// create temp-folder
if(!fs.existsSync(__dirname + "/tmp")) {
    fs.mkdirSync(__dirname + "/tmp");
}

// queue timeout 30s
var q = queue({
    timeout: 30000,
    concurrency: 10
});

var TWITCH_EMOTES_GLOBAL_URL = "https://api.twitch.tv/kraken/chat/emoticons";
var TWITCH_EMOTES_CHANNEL_URL = "https://api.twitch.tv/kraken/chat/:channel/emoticons";
var BTTV_EMOTES_URL = "https://api.betterttv.net/2/emotes/";

var icons = {};
var urls = [];

// Parse ARGV
// parse channel
argv["_"].forEach(function(channel) {
    urls.push(TWITCH_EMOTES_CHANNEL_URL.replace(":channel", channel));
});

// check if global
if(argv["g"]) {
    urls.push(TWITCH_EMOTES_GLOBAL_URL);
}

var ttvwl = ["FeelsBadMan", "FeelsGoodMan", "SteamSale", "gabeN", "bUrself", "RarePepe", "CiGrip", "SourPls"];

q.push(function(cb) {
  https.get(BTTV_EMOTES_URL, function(res) {
    var body = '';
    res.on('data', function(chunk){ body += chunk; });
    res.on('end', function(a,b){
      if(res.statusCode != 200)
      {
        console.log("Reading URL: " + url + " ERROR");
        cb();
        return;
      }

      var jsonResponse = JSON.parse(body);
      jsonResponse["emotes"].forEach(function(emote) {
        var regex = emote["code"];
        var emoteUrl;

        if(!regex.match(/^[a-zA-Z][a-zA-Z0-9-_]*$/)){ //|| ttvwl.indexOf(regex) == -1){
          console.log(regex+" doesn't match.");
          return;
        }

        emoteUrl = "https://cdn.betterttv.net/emote/"+emote.id+"/1x";

        q.push(function(cbb){
          https.get(emoteUrl, function (res) {
            res.once('data', function (chunk) {
              res.destroy();
              var typ = imageType(chunk);
              if(typ == null)
              {
                console.log(regex+" is not a valid image");
                return cbb();
              }

              if(typ.ext !== "png")
              {
                console.log(regex+" type "+typ.ext+" isnt usable");
                return cbb();
              }

              icons[regex + "." + typ.ext] = emoteUrl;
              cbb();
            });
          });
        });
      });

      console.log("Reading URL: " + BTTV_EMOTES_URL + " OK");

      cb();
    });
  });
});

// put every url in queue to crawl json
urls.forEach(function(url) {
    q.push(function(cb) {
        https.get(url, function(res) {

            var body = '';
            res.on('data', function(chunk) {
                body += chunk;
            });

            res.on('end', function(a,b) {
                if(res.statusCode != 200) {
                    console.log("Reading URL: " + url + " ERROR");
                    cb();
                    return;
                }
                var jsonResponse = JSON.parse(body);
                jsonResponse["emoticons"].forEach(function(emote) {
                    var regex = emote["regex"];
                    var emoteUrl;

                    if(regex === "4Head")
                    {
                      console.log("special exception for 4Head");
                      regex = "_4Head";
                    }else if(!regex.match(/^[a-zA-Z][a-zA-Z0-9-_]*$/))  {
                      console.log(regex+" doesn't match.");
                      return;
                    }

                    if(emote["url"]) {
                        emoteUrl = emote["url"]
                    } else {
                        // global icon has different json format
                        emoteUrl = emote["images"][0]["url"];
                    }
                    icons[regex + path.extname(emoteUrl)] = emoteUrl;
                });
                console.log("Reading URL: " + url + " OK");
                cb();
            });
        }).on('error', function(e) {
            console.log("Error:", e);
        });
    })
});

q.on('end', function() {
    if(status == 1) {
        console.log("Emoticon Download Finished");
        generateSprites();
    }

    if(status == 0) {
        console.log("JSON Download finished")
        status = 1;
        downloadIcons();
    }
})

q.start();

function downloadIcons() {
    Object.keys(icons).forEach(function(k) {
        q.push(function(cb) {
            var file = fs.createWriteStream(__dirname + "/tmp/" + k, { flags: 'w' });

            if(!(/^http:\/\//.test(icons[k])))
            {
              var reqest = https.get(icons[k], function(response) {
                  response.pipe(file);
                  console.log("Downloaded: " + k);
                  cb();
              });
            }else{
              var request = http.get(icons[k], function(response) {
                  response.pipe(file);
                  console.log("Downloaded: " + k);
                  cb();
              });
            }
        });
    });

    q.start();
}

function generateSprites() {
    var images = [];
    Object.keys(icons).forEach(function(k) {
        images.push("tmp/" + k);
    });
    var builder = new Builder({
        outputDirectory: 'assets',
        outputImage: 'images/twitch-emoticons.png',
        outputCss: 'stylesheets/twitch-emoticons.css',
        selector: '.twitch',
        images: images
    });

    builder.build( function() {
        console.log( "Spritesheet built from " + builder.files.length + " images" );

        // now insert display: inline into the css file since its hardcoded in the spritesheet package
        fs.readFile(__dirname + "/assets/stylesheets/twitch-emoticons.css", function(err, data) {
            var array = data.toString().split("\n");
            array.splice(1,0, "  display: inline-block;");
            for(i=0;i<array.length;i++) {
                fs.appendFileSync(__dirname + "/assets/stylesheets/twitch-emoticons.css", array[i]+'\n');
            }
        });

        var iconsl = Object.keys(icons).sort().map(function(o) { return path.basename(o, path.extname(o)); });

        // generate showcase
        if(argv["s"]) {
            var template = swig.compileFile(__dirname + "/src/showcase.html.swig");
            var output = template({
                icons: iconsl
            });

            fs.writeFileSync("showcase.html", output);
            console.log("Showcase generated");
        }

        if(argv["j"]){
          fs.writeFileSync("icons.json", JSON.stringify(iconsl));
          iconswd = {};
          iconsw = [];
          data = fs.readFileSync(__dirname + "/assets/stylesheets/twitch-emoticons.css");
          var array = data.toString().split("\n");
          var regw = /(width: )(\d+)(px;)/g;
          var regn = /(.twitch.)(\S+)( {)/g;
          var lastn = "";
          array.forEach(function(line){

            while(matches = regn.exec(line))
            {
              lastn = matches[2];
              return;
            }

            while(matches = regw.exec(line))
            {
              iconswd[lastn] = parseInt(matches[2]);
              return;
            }
          });

          iconsl.forEach(function(icon){
            iconsw.push(iconswd[icon]);
          });

          fs.writeFileSync("iconswidths.json", JSON.stringify(iconsw));
          console.log(iconswd);
        }

        // no cleanup?
        if(!argv["n"]) {
            Object.keys(icons).forEach(function(k) {
                fs.unlinkSync(__dirname + "/tmp/" + k);
            });
            fs.rmdirSync(__dirname + "/tmp");
            console.log("Temporary files removed")
        }
    });
}
