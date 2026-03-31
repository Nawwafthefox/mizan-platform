package com.mizan.config;
import java.util.Map;

public class BranchMaps {
    public static final Map<String,String> BRANCH_NAME = Map.ofEntries(
        Map.entry("1404","البوادي"), Map.entry("1461","حائل 1"),
        Map.entry("1462","حائل 2"), Map.entry("1463","حائل 3"),
        Map.entry("1464","حائل 4"), Map.entry("1465","حائل 5"),
        Map.entry("1601","الرياض 1"), Map.entry("1602","الرياض 2"),
        Map.entry("1603","الرياض 3"), Map.entry("1604","الرياض 4"),
        Map.entry("1605","الرياض 5"), Map.entry("1702","مكة 2"),
        Map.entry("3401","حفر الباطن 1"), Map.entry("3402","حفر الباطن 2"),
        Map.entry("3403","حفر الباطن 3"), Map.entry("3404","حفر الباطن 4"),
        Map.entry("3407","حفر الباطن 7"), Map.entry("4405","المدينة 5"),
        Map.entry("4406","المدينة 6"), Map.entry("4408","المدينة 8"),
        Map.entry("4409","المدينة 9"), Map.entry("4420","العلا"),
        Map.entry("5401","خميس مشيط 1"), Map.entry("5402","خميس مشيط 2"),
        Map.entry("5405","خميس مشيط 5"), Map.entry("7403","أبو عريش 2"),
        Map.entry("7405","صبيا"), Map.entry("7410","أبو عريش 3")
    );

    public static final Map<String,String> BRANCH_REGION = Map.ofEntries(
        Map.entry("1404","الغربية"), Map.entry("1702","الغربية"),
        Map.entry("1601","الرياض"), Map.entry("1602","الرياض"),
        Map.entry("1603","الرياض"), Map.entry("1604","الرياض"),
        Map.entry("1605","الرياض"),
        Map.entry("1461","حائل"), Map.entry("1462","حائل"),
        Map.entry("1463","حائل"), Map.entry("1464","حائل"),
        Map.entry("1465","حائل"),
        Map.entry("3401","حفر الباطن"), Map.entry("3402","حفر الباطن"),
        Map.entry("3403","حفر الباطن"), Map.entry("3404","حفر الباطن"),
        Map.entry("3407","حفر الباطن"),
        Map.entry("4405","المدينة المنورة"), Map.entry("4406","المدينة المنورة"),
        Map.entry("4408","المدينة المنورة"), Map.entry("4409","المدينة المنورة"),
        Map.entry("4420","المدينة المنورة"),
        Map.entry("5401","عسير/جيزان"), Map.entry("5402","عسير/جيزان"),
        Map.entry("5405","عسير/جيزان"), Map.entry("7403","عسير/جيزان"),
        Map.entry("7405","عسير/جيزان"), Map.entry("7410","عسير/جيزان")
    );

    public static String getName(String code) {
        return BRANCH_NAME.getOrDefault(code, code);
    }
    public static String getRegion(String code) {
        return BRANCH_REGION.getOrDefault(code, "غير محدد");
    }
}
