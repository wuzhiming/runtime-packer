/**
 * Created by wzm on 20/07/2018.
 */

'use strict';

exports.template = `
        <ui-prop name="屏幕方向">
            <ui-select class="flex-1" v-value="runtimeSetting.deviceOrientation">
                    <option value="portrait">竖屏</option>
                    <option value="landscape">横屏</option>
            </ui-select>
        </ui-prop>
        
        <ui-prop name="状态栏显示" auto-height>
            <ui-checkbox v-value="runtimeSetting.showStatusBar"></ui-checkbox>
        </ui-prop>
        
        <ui-prop name="runtime版本" auto-height>
            <ui-input class="flex-1" v-value="runtimeSetting.runtimeVersion"></ui-input>
        </ui-prop>
`;

exports.name = 'runtime';

exports.props = {
    'data': null,
    'project': null,
    'anysdk': null,
};

exports.data = function () {
    return {
        runtimeSetting: {
            deviceOrientation: "portrait",
            showStatusBar: false,
            runtimeVersion: "1.0.0"
        },
        //记录原来的EncryptJs的选项
        originEncryptJs: false,
        profile: null,
    };
};

exports.watch = {
    runtimeSetting: {
        handler(val){
            Object.assign(this.profile.data, this.runtimeSetting);
            this.profile.save();
        },
        deep: true,
    }
};

exports.created = function () {
    this.originEncryptJs = this.project.encryptJs;
    this.project.encryptJs = false;
    Editor.Profile.load('profile://project/cpk-publish.json', (err, ret) => {
        if (err) return;
        this.profile = ret;
        this.runtimeSetting = ret.data;
    });
};

exports.directives = {};
exports.destroyed = function () {
    this.project.encryptJs = this.originEncryptJs;
};

exports.methods = {};